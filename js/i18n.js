/*
  Website translations (English / Arabic / Swahili).

  Translators work in one spreadsheet, i18n/website.csv (English, Arabic,
  Swahili). tools/i18n/build-dictionaries.mjs turns it into i18n/ar.json
  and i18n/sw.json, keyed by the English text itself — so the HTML pages
  need no markup changes and a page edit never silently breaks a
  translation id; a changed English sentence simply shows in English
  until its new row is translated.

  A "unit" is the smallest element holding a whole sentence: an element
  whose content is only text plus simple inline tags (links, bold, …).
  Its key is that content with the inline tags' attributes removed, e.g.
    New here? <a>Create your account</a>.
  Translators keep the <a>…</a> markers; when a translation is applied,
  each marker gets the original link's attributes back, in order, so
  hrefs and classes never live in the spreadsheet.

  tools/i18n/extract-website-strings.mjs loads every page in a real
  browser and calls AdorI18n.collect() — the same code the live site
  runs — so extracted keys always match what the page looks up.
*/
(function () {
  "use strict";

  var LANGS = { en: { dir: "ltr", label: "English" }, ar: { dir: "rtl", label: "العربية" }, sw: { dir: "ltr", label: "Kiswahili" } };
  var STORAGE_KEY = "aw_lang";
  var INLINE = { A: 1, STRONG: 1, EM: 1, B: 1, I: 1, BR: 1, SPAN: 1, SMALL: 1, CODE: 1, ABBR: 1, TIME: 1, SUP: 1, SUB: 1, MARK: 1, U: 1 };
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, PRE: 1, TEXTAREA: 1, IFRAME: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1 };
  var ATTRS = ["placeholder", "aria-label", "title", "alt", "label"];
  // Attributes holding copy that page scripts swap into view later (hero
  // audience text, service details, form messages). Not translated in
  // place — they're collected so their text is in the spreadsheet, and
  // translated by the MutationObserver once a script shows them.
  var COPY_ATTRS = [
    "data-title", "data-deliverable", "data-inputs", "data-timeframe", "data-excludes",
    "data-talent", "data-employer", "data-service-group", "data-success-message",
    "data-audience-placeholder-talent", "data-audience-placeholder-talent-mobile",
    "data-audience-placeholder-employer", "data-audience-placeholder-employer-mobile",
    "data-slide-0", "data-slide-1", "data-slide-2",
  ];

  var dict = null;
  var current = "en";
  var originals = new WeakMap(); // element -> original innerHTML
  var originalAttrs = new WeakMap(); // element -> { attr: original }
  var originalTitle = document.title;
  var observer = null;

  function norm(s) {
    return s.replace(/\s+/g, " ");
  }

  function hasText(el) {
    return /[A-Za-z]/.test(el.textContent || "");
  }

  function skipped(el) {
    if (SKIP[el.tagName] || el.closest("[data-no-i18n], .no-i18n")) return true;
    return false;
  }

  function inlineOnly(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1) {
        if (!INLINE[n.tagName] || !inlineOnly(n)) return false;
      } else if (n.nodeType !== 3 && n.nodeType !== 8) {
        return false;
      }
    }
    return true;
  }

  /** The lookup key for a unit element: its text with inline tags reduced to bare markers. */
  function keyOf(el) {
    var out = "";
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) {
        var t = n.tagName.toLowerCase();
        out += t === "br" ? "<br>" : "<" + t + ">" + keyOf(n) + "</" + t + ">";
      }
    }
    return norm(out).trim();
  }

  /** Visits every translatable unit and attribute under root. */
  function walk(root, onUnit, onText, onAttr) {
    function visit(el) {
      if (el.nodeType !== 1 || skipped(el)) return;
      // Already-translated content has no Latin letters left to detect, so
      // anything recorded as translated is always revisited (for restore).
      var savedAttrs = originalAttrs.get(el);
      for (var a = 0; a < ATTRS.length; a++) {
        var v = el.getAttribute(ATTRS[a]);
        if (v && (/[A-Za-z]/.test(v) || (savedAttrs && ATTRS[a] in savedAttrs))) onAttr(el, ATTRS[a]);
      }
      if (el.tagName === "INPUT" && /^(submit|button)$/i.test(el.type) && el.value) onAttr(el, "value");
      if (originals.has(el)) {
        onUnit(el);
        return;
      }
      if (el.tagName === "OPTION") {
        if (hasText(el)) onUnit(el);
        return;
      }
      // A block holding "don't translate" parts (e.g. an employer's name
      // next to a "Verified" label) is split into its pieces instead.
      if (el !== document.body && hasText(el) && inlineOnly(el) && !el.querySelector("[data-no-i18n], .no-i18n")) {
        onUnit(el);
        return;
      }
      // Mixed content: translate loose text nodes on their own, recurse into elements.
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 && (n.__awOrig || /[A-Za-z]/.test(n.nodeValue))) onText(n);
        else if (n.nodeType === 1) visit(n);
      }
    }
    visit(root);
  }

  /** Every English key on the page — used by the extraction tool. */
  function collect() {
    var keys = [];
    var seen = {};
    function add(k) {
      if (k && !seen[k]) {
        seen[k] = 1;
        keys.push(k);
      }
    }
    add(norm(document.title).trim());
    if (document.querySelector("main[data-english-only]")) add(ENGLISH_ONLY_NOTE);
    walk(
      document.body,
      function (el) { add(keyOf(el)); },
      function (node) { add(norm(node.nodeValue).trim()); },
      function (el, attr) { add(norm(el.getAttribute(attr)).trim()); }
    );
    COPY_ATTRS.forEach(function (attr) {
      document.querySelectorAll("[" + attr + "]").forEach(function (el) {
        if (el.closest("[data-no-i18n], .no-i18n")) return;
        var v = el.getAttribute(attr);
        if (v && /[A-Za-z]{2}/.test(v)) add(norm(v).trim());
      });
    });
    return keys;
  }

  /** Rebuilds a unit from its translation, giving each inline marker the original element's attributes. */
  function applyUnit(el, translated) {
    var byTag = {};
    var all = el.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) (byTag[all[i].tagName] = byTag[all[i].tagName] || []).push(all[i]);
    var tpl = document.createElement("template");
    tpl.innerHTML = translated;
    var used = {};
    var marks = tpl.content.querySelectorAll("*");
    for (var j = 0; j < marks.length; j++) {
      var m = marks[j];
      if (!INLINE[m.tagName]) {
        m.replaceWith(document.createTextNode(m.textContent));
        continue;
      }
      // Nothing from the spreadsheet cell survives but the bare marker:
      // attributes (href, onclick, style…) only ever come from the page.
      while (m.attributes.length) m.removeAttribute(m.attributes[0].name);
      var idx = used[m.tagName] || 0;
      used[m.tagName] = idx + 1;
      var src = (byTag[m.tagName] || [])[idx];
      if (src) for (var k = 0; k < src.attributes.length; k++) m.setAttribute(src.attributes[k].name, src.attributes[k].value);
    }
    el.replaceChildren(tpl.content);
  }

  /**
   * Exact match first; otherwise a sentence with one number in it
   * ("3 open opportunities") matches its "{n}" row ("{n} open
   * opportunities") with the number put back.
   */
  function lookup(key) {
    if (!key) return null;
    if (dict[key]) return dict[key];
    var nums = key.match(/\d[\d,.]*/g);
    if (!nums) return null;
    var t = dict[key.replace(/\d[\d,.]*/g, "{n}")];
    if (!t) return null;
    var i = 0;
    return t.replace(/\{n\}/g, function () {
      return nums[i++] || "";
    });
  }

  function translateTree(root) {
    walk(
      root,
      function (el) {
        var key = originals.has(el) ? originals.get(el).key : keyOf(el);
        var t = lookup(key);
        if (!t) return;
        // A form option with no explicit value submits its text: pin the
        // English so staff receive the same values whatever the language.
        if (el.tagName === "OPTION" && !el.hasAttribute("value")) el.setAttribute("value", el.text);
        if (!originals.has(el)) originals.set(el, { key: key, html: el.innerHTML });
        applyUnit(el, t);
      },
      function (node) {
        if (!node.__awOrig) node.__awOrig = node.nodeValue;
        var raw = node.__awOrig;
        var t = lookup(norm(raw).trim());
        if (!t) return;
        var lead = raw.match(/^\s*/)[0];
        var trail = raw.match(/\s*$/)[0];
        node.nodeValue = lead + t + trail;
      },
      function (el, attr) {
        var saved = originalAttrs.get(el) || {};
        if (!(attr in saved)) saved[attr] = el.getAttribute(attr);
        originalAttrs.set(el, saved);
        var t = lookup(norm(saved[attr]).trim());
        if (t) el.setAttribute(attr, t);
      }
    );
  }

  function restoreTree(root) {
    walk(
      root,
      function (el) {
        if (originals.has(el)) {
          el.innerHTML = originals.get(el).html;
          originals.delete(el);
        }
      },
      function (node) {
        if (node.__awOrig) node.nodeValue = node.__awOrig;
      },
      function (el, attr) {
        var saved = originalAttrs.get(el);
        if (saved && attr in saved) el.setAttribute(attr, saved[attr]);
      }
    );
  }

  var ENGLISH_ONLY_NOTE = "This page is available in English only. The English version is the official one.";

  /** Legal pages keep their official English text; say so when another language is chosen. */
  function englishOnlyNotice(show) {
    var existing = document.getElementById("aw-english-only");
    var main = document.querySelector("main[data-english-only]");
    if (!show || !main) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var note = document.createElement("div");
    note.id = "aw-english-only";
    note.className = "container";
    var p = document.createElement("p");
    p.className = "notice";
    p.setAttribute("role", "note");
    p.textContent = ENGLISH_ONLY_NOTE;
    note.appendChild(p);
    main.parentNode.insertBefore(note, main);
  }

  function setDocumentLang(lang) {
    var root = document.documentElement;
    root.lang = lang;
    root.dir = LANGS[lang].dir;
    root.classList.remove("aw-i18n-pending");
  }

  function loadArabicFont() {
    if (document.getElementById("aw-arabic-font")) return;
    var link = document.createElement("link");
    link.id = "aw-arabic-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@500;600;700;800&display=swap";
    document.head.appendChild(link);
  }

  var OBSERVE = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };

  /** The nearest element that was translated as a whole unit, if any. */
  function unitAncestor(node) {
    for (var el = node.nodeType === 1 ? node : node.parentElement; el && el !== document.body; el = el.parentElement) {
      if (originals.has(el)) return el;
    }
    return null;
  }

  /**
   * Page scripts keep changing text after load (hero audience tabs, the
   * service pop-up, job listings, form messages). Whatever they write is
   * English, so it's translated again; a unit whose content a script
   * replaced forgets its old English original first.
   */
  function watch() {
    if (observer) return;
    observer = new MutationObserver(function (records) {
      if (current === "en" || !dict) return;
      observer.disconnect();
      var roots = [];
      records.forEach(function (r) {
        if (r.type === "attributes") {
          var saved = originalAttrs.get(r.target);
          if (saved) delete saved[r.attributeName];
          roots.push(r.target);
          return;
        }
        var unit = unitAncestor(r.target);
        if (unit) {
          originals.delete(unit);
          roots.push(unit);
        }
        if (r.type === "characterData") {
          if (r.target.__awOrig) delete r.target.__awOrig;
          if (r.target.parentElement) roots.push(r.target.parentElement);
          return;
        }
        r.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) roots.push(n);
          else if (n.nodeType === 3 && n.parentElement) roots.push(n.parentElement);
        });
      });
      roots.forEach(function (el) {
        if (el.isConnected) translateTree(el);
      });
      observer.observe(document.body, OBSERVE);
    });
    observer.observe(document.body, OBSERVE);
  }

  function remember(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* storage can be unavailable (private mode) — the ?lang= link still works */
    }
  }

  function switchTo(lang) {
    if (!LANGS[lang]) lang = "en";
    remember(lang);
    if (lang === "en") {
      if (observer) observer.disconnect();
      observer = null;
      restoreTree(document.body);
      englishOnlyNotice(false);
      document.title = originalTitle;
      current = "en";
      setDocumentLang("en");
      syncSwitchers();
      return Promise.resolve();
    }
    if (lang === "ar") loadArabicFont();
    return fetch("/i18n/" + lang + ".json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (d) {
        if (observer) observer.disconnect();
        observer = null;
        if (current !== "en") restoreTree(document.body);
        dict = d;
        current = lang;
        englishOnlyNotice(true);
        translateTree(document.body);
        var t = dict[norm(originalTitle).trim()];
        document.title = t || originalTitle;
        setDocumentLang(lang);
        syncSwitchers();
        watch();
      })
      .catch(function () {
        // Dictionary unavailable: stay readable in English rather than hidden.
        setDocumentLang("en");
      });
  }

  function syncSwitchers() {
    document.querySelectorAll("[data-lang-switch]").forEach(function (sel) {
      sel.value = current;
    });
    // Links into the platform app carry the language so it opens in the same one.
    document.querySelectorAll('a[href^="https://ador-works.vercel.app"]').forEach(function (a) {
      try {
        var u = new URL(a.href);
        if (current === "en") u.searchParams.delete("lang");
        else u.searchParams.set("lang", current);
        a.href = u.toString();
      } catch (e) {
        /* leave malformed hrefs alone */
      }
    });
  }

  function buildSwitcher() {
    var nav = document.querySelector(".site-nav ul");
    if (!nav || document.querySelector("[data-lang-switch]")) return;
    var li = document.createElement("li");
    li.className = "nav-lang no-i18n";
    var label = document.createElement("label");
    label.className = "visually-hidden";
    label.htmlFor = "aw-lang";
    label.textContent = "Language";
    var sel = document.createElement("select");
    sel.id = "aw-lang";
    sel.setAttribute("data-lang-switch", "");
    sel.setAttribute("aria-label", "Language / اللغة / Lugha");
    Object.keys(LANGS).forEach(function (code) {
      var o = document.createElement("option");
      o.value = code;
      o.lang = code;
      o.textContent = LANGS[code].label;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      switchTo(sel.value);
      var url = new URL(location.href);
      if (sel.value === "en") url.searchParams.delete("lang");
      else url.searchParams.set("lang", sel.value);
      history.replaceState(null, "", url);
    });
    li.appendChild(label);
    li.appendChild(sel);
    var cta = nav.querySelector(".nav-cta");
    nav.insertBefore(li, cta || null);
  }

  function initialLang() {
    var fromUrl = new URLSearchParams(location.search).get("lang");
    if (fromUrl && LANGS[fromUrl]) {
      remember(fromUrl);
      return fromUrl;
    }
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGS[saved]) return saved;
    } catch (e) {
      /* ignore */
    }
    return "en";
  }

  window.AdorI18n = { collect: collect, switchTo: switchTo, current: function () { return current; } };

  if (window.__AW_I18N_EXTRACT__) return; // extraction mode: expose collect() only

  function start() {
    buildSwitcher();
    var lang = initialLang();
    if (lang === "en") {
      setDocumentLang("en");
      syncSwitchers();
    } else {
      switchTo(lang);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
