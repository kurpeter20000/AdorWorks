/*
  AdorWorks site behaviour: nav toggle, analytics event hooks, form submission.

  Analytics: pushes to window.dataLayer (Google Tag Manager convention).
  js/analytics.js (loaded after this file on every page) is what actually
  turns these into real GA4 events, gated behind cookie consent and a
  configured Measurement ID (js/analytics-config.js) — see that file for
  how. This file doesn't need to know analytics exists at all.

  Forms: every form built for Netlify Forms (data-netlify="true"). Netlify
  detects each one from the static HTML at deploy time; this script just
  intercepts submission to POST it via fetch and show inline status,
  instead of a full page reload to Netlify's default success page.
*/
(function () {
  "use strict";

  window.dataLayer = window.dataLayer || [];

  function track(action, detail) {
    window.dataLayer.push(
      Object.assign({ event: "adorworks_event", action: action }, detail || {})
    );
  }
  window.adorworksTrack = track;

  // Service worker: makes the site installable and usable offline. Safe to
  // skip silently on browsers without support (e.g. some older phones).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        // Offline-capability is a progressive enhancement — a failed
        // registration should never block the page from working.
      });
    });
  }

  // "Install app" prompt: Chrome/Edge/Android fire beforeinstallprompt
  // instead of showing install UI automatically everywhere, so we capture
  // it and inject our own dismissible banner (built here rather than in
  // each page's markup, so every page gets it for free). iOS Safari has no
  // such event — install there is manual via the Share sheet — so the
  // banner simply never appears for those visitors.
  var deferredInstallPrompt = null;
  var INSTALL_DISMISSED_KEY = "adorworks_install_dismissed";

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (err) { return null; }
  }
  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (err) { /* ignore */ }
  }

  function showInstallBanner() {
    if (document.getElementById("install-banner")) return;
    if (safeSessionGet(INSTALL_DISMISSED_KEY)) return;

    var banner = document.createElement("div");
    banner.id = "install-banner";
    banner.className = "install-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Install AdorWorks");
    banner.innerHTML =
      '<span class="install-banner-text">Install AdorWorks for quicker access, even with a weak connection.</span>' +
      '<span class="install-banner-actions">' +
      '<button type="button" class="btn btn-primary" data-install-accept>Install</button>' +
      '<button type="button" class="install-banner-dismiss" data-install-dismiss aria-label="Dismiss">&times;</button>' +
      "</span>";
    document.body.appendChild(banner);
  }

  function hideInstallBanner() {
    var banner = document.getElementById("install-banner");
    if (banner) banner.remove();
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner();
  });

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-install-accept]") && deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function (choice) {
        track("pwa_install_prompt", { outcome: choice.outcome });
        deferredInstallPrompt = null;
        hideInstallBanner();
      });
    }
    if (e.target.closest("[data-install-dismiss]")) {
      safeSessionSet(INSTALL_DISMISSED_KEY, "1");
      hideInstallBanner();
    }
  });

  window.addEventListener("appinstalled", function () {
    hideInstallBanner();
    track("pwa_installed", {});
  });

  document.addEventListener("DOMContentLoaded", function () {
    // Mobile nav toggle
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var isOpen = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
      nav.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          if (window.innerWidth < 960) {
            nav.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
          }
        });
      });
    }

    // Hero background video: decorative only (muted, looping, no controls),
    // not the talent-facing video feature, so none of that consent/caption
    // handling applies here. Skipped on narrow screens, reduced-motion or a
    // Data Saver connection -- the poster frame already shown via the
    // `poster` attribute is the low-data fallback in every one of those
    // cases, and autoplay staying off never leaves the section blank.
    var heroVideos = document.querySelectorAll(".hero-video");
    if (heroVideos.length) {
      var saveData = Boolean(navigator.connection && navigator.connection.saveData);
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var wideEnough = window.matchMedia("(min-width: 768px)").matches;
      if (wideEnough && !reduceMotion && !saveData) {
        heroVideos.forEach(function (heroVideo) {
          heroVideo.muted = true;
          heroVideo.play().catch(function () {
            // Autoplay blocked by the browser -- poster frame stays visible.
          });
        });
      }
    }

    // Hero audience toggle (homepage only): switches the search
    // destination/placeholder, which chip set shows, and which CTA is
    // primary for the visitor's stated intent, instead of showing three
    // flat, equal-weight buttons at once.
    var heroAudience = document.querySelector("[data-hero-audience]");
    if (heroAudience) {
      var audienceTabs = heroAudience.querySelectorAll("[data-audience-tab]");
      var searchForm = heroAudience.querySelector("[data-audience-search]");
      var searchInput = searchForm ? searchForm.querySelector("input[name=q]") : null;

      // Auto-typing example queries in the search placeholder -- writes
      // only to `placeholder`, never `value`, so it can never clobber
      // anything the visitor actually types (and typing into the field
      // simply hides the placeholder underneath, same as any input).
      // Fully skipped under prefers-reduced-motion in favour of the
      // plain static swap this replaces (see the `data-audience-
      // placeholder-*` attributes still on the input in index.html).
      var SEARCH_TYPEWRITER_PHRASES = {
        employer: [
          "Search skills or categories to hire",
          "e.g. graphic designer",
          "e.g. web developer",
          "e.g. virtual assistant",
          "e.g. video editor",
        ],
        talent: [
          "Search roles or categories to find work",
          "e.g. content writer",
          "e.g. bookkeeper",
          "e.g. photographer",
          "e.g. data entry",
        ],
      };
      var reduceMotionForSearch = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var stopSearchTypewriter = null;

      function startSearchTypewriter(input, phrases) {
        var phraseIndex = 0;
        var charIndex = phrases[0].length;
        var deleting = true;
        var timeoutId = null;

        // Starts already showing phrases[0] in full -- identical to the
        // static placeholder this replaces, so there's no visible jump
        // the moment the typewriter takes over.
        input.placeholder = phrases[0];

        function tick() {
          var phrase = phrases[phraseIndex % phrases.length];
          if (deleting) {
            charIndex--;
            input.placeholder = phrase.slice(0, charIndex);
            if (charIndex === 0) {
              deleting = false;
              phraseIndex++;
              timeoutId = window.setTimeout(tick, 400);
              return;
            }
            timeoutId = window.setTimeout(tick, 28);
          } else {
            var next = phrases[phraseIndex % phrases.length];
            charIndex++;
            input.placeholder = next.slice(0, charIndex);
            if (charIndex === next.length) {
              deleting = true;
              timeoutId = window.setTimeout(tick, 1700);
              return;
            }
            timeoutId = window.setTimeout(tick, 55);
          }
        }

        timeoutId = window.setTimeout(tick, 1700);
        return function stop() {
          window.clearTimeout(timeoutId);
        };
      }

      function updateSearchPlaceholder(audience) {
        if (!searchInput) return;
        if (stopSearchTypewriter) {
          stopSearchTypewriter();
          stopSearchTypewriter = null;
        }
        if (reduceMotionForSearch) {
          var placeholder = searchInput.getAttribute("data-audience-placeholder-" + audience);
          if (placeholder) searchInput.placeholder = placeholder;
          return;
        }
        stopSearchTypewriter = startSearchTypewriter(
          searchInput,
          SEARCH_TYPEWRITER_PHRASES[audience] || SEARCH_TYPEWRITER_PHRASES.employer
        );
      }

      function setAudience(audience) {
        audienceTabs.forEach(function (tab) {
          tab.setAttribute("aria-selected", String(tab.getAttribute("data-audience-tab") === audience));
        });
        heroAudience.querySelectorAll("[data-audience-chips]").forEach(function (el) {
          el.hidden = el.getAttribute("data-audience-chips") !== audience;
        });
        if (searchForm) searchForm.action = audience === "talent" ? "for-talent.html" : "for-employers.html";
        updateSearchPlaceholder(audience);
        track("hero_audience_switch", { audience: audience });
      }

      audienceTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          setAudience(tab.getAttribute("data-audience-tab"));
        });
      });

      updateSearchPlaceholder("employer");
    }

    // Category search-match highlight: if a visitor arrives at
    // for-employers.html (or is redirected there from the homepage
    // search) with a ?q= term, scroll to and highlight any matching
    // category card instead of the search silently going nowhere.
    var categoryCards = document.querySelectorAll(".category-card");
    if (categoryCards.length) {
      var q = new URLSearchParams(window.location.search).get("q");
      if (q && q.trim()) {
        var needle = q.trim().toLowerCase();
        var firstMatch = null;
        categoryCards.forEach(function (card) {
          if (card.textContent.toLowerCase().indexOf(needle) !== -1) {
            card.classList.add("is-match");
            if (!firstMatch) firstMatch = card;
          }
        });
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    // Service detail modal (services.html): each category card's photo
    // tiles open a shared <dialog> with the full deliverable/inputs/
    // excludes detail plus prev/next through that same category's tiles.
    var serviceModal = document.getElementById("service-modal");
    if (serviceModal && typeof serviceModal.showModal === "function") {
      var serviceGroups = Array.from(document.querySelectorAll("[data-service-group]")).map(function (group) {
        return {
          name: group.getAttribute("data-service-group"),
          tiles: Array.from(group.querySelectorAll(".service-tile")),
        };
      });
      var modalPhoto = document.getElementById("service-modal-photo");
      var modalCategory = document.getElementById("service-modal-category");
      var modalTitle = document.getElementById("service-modal-title");
      var modalFacts = document.getElementById("service-modal-facts");
      var modalPosition = document.getElementById("service-modal-position");
      var modalRequest = document.getElementById("service-modal-request");
      var modalPrev = serviceModal.querySelector("[data-modal-prev]");
      var modalNext = serviceModal.querySelector("[data-modal-next]");
      var activeGroup = null;
      var activeIndex = 0;

      function renderService() {
        var tile = activeGroup.tiles[activeIndex];
        var img = tile.querySelector("img");
        modalPhoto.src = img.currentSrc || img.src;
        modalCategory.textContent = activeGroup.name;
        modalTitle.textContent = tile.getAttribute("data-title");
        modalRequest.setAttribute("data-service-title", tile.getAttribute("data-title"));

        var facts = "";
        facts += "<dt>Deliverable</dt><dd>" + tile.getAttribute("data-deliverable") + "</dd>";
        facts += "<dt>Inputs needed</dt><dd>" + tile.getAttribute("data-inputs") + "</dd>";
        var timeframe = tile.getAttribute("data-timeframe");
        if (timeframe) facts += "<dt>Typical timeframe</dt><dd>" + timeframe + "</dd>";
        facts += "<dt>Excludes</dt><dd>" + tile.getAttribute("data-excludes") + "</dd>";
        modalFacts.innerHTML = facts;

        modalPosition.textContent = (activeIndex + 1) + " of " + activeGroup.tiles.length;
        modalPrev.disabled = activeGroup.tiles.length < 2;
        modalNext.disabled = activeGroup.tiles.length < 2;
      }

      function openService(group, index) {
        activeGroup = group;
        activeIndex = index;
        renderService();
        if (!serviceModal.open) serviceModal.showModal();
        track("service_detail_view", { service: activeGroup.tiles[activeIndex].getAttribute("data-title") });
      }

      function step(delta) {
        if (!activeGroup) return;
        var len = activeGroup.tiles.length;
        activeIndex = (activeIndex + delta + len) % len;
        renderService();
      }

      serviceGroups.forEach(function (group) {
        group.tiles.forEach(function (tile, index) {
          tile.addEventListener("click", function () {
            openService(group, index);
          });
        });
      });

      modalPrev.addEventListener("click", function () { step(-1); });
      modalNext.addEventListener("click", function () { step(1); });

      serviceModal.addEventListener("click", function (e) {
        if (e.target === serviceModal || e.target.closest("[data-modal-close]")) {
          serviceModal.close();
        }
      });

      serviceModal.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
      });

      // Preselect the matching option in the "Request a service" form below
      // instead of just scrolling to a blank dropdown.
      modalRequest.addEventListener("click", function () {
        var select = document.getElementById("sv-service");
        var title = modalRequest.getAttribute("data-service-title");
        if (select && title) {
          var match = Array.from(select.options).find(function (opt) { return opt.text === title; });
          if (match) select.value = match.value;
        }
        serviceModal.close();
      });
    }

    // Service deck rows (services.html): each category's row of full-size
    // service cards is its own scroll-snap carousel -- the flanking arrows
    // move it by exactly one card and disable at either end, mirroring
    // native browser prev/next controls rather than jumping between
    // categories (each category is its own always-visible section, same
    // as any other .section on the page).
    var reduceMotionForDeck = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll(".service-deck-row").forEach(function (row) {
      var wrap = row.closest(".service-deck-visual");
      if (!wrap) return;
      var prevBtn = wrap.querySelector("[data-row-prev]");
      var nextBtn = wrap.querySelector("[data-row-next]");
      if (!prevBtn || !nextBtn) return;

      function updateButtons() {
        // Tolerance (not <= 0) because scroll-snap can settle the resting
        // position a few px off true zero/max (the row's own bleed
        // padding for the tile hover-lift shadow shifts the snap point).
        var max = row.scrollWidth - row.clientWidth;
        prevBtn.disabled = row.scrollLeft <= 4;
        nextBtn.disabled = row.scrollLeft >= max - 4;
      }

      function stepRow(direction) {
        var tile = row.querySelector(".service-tile");
        var gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap || "0");
        var step = tile ? tile.getBoundingClientRect().width + gap : row.clientWidth;
        row.scrollBy({ left: direction * step, behavior: reduceMotionForDeck ? "auto" : "smooth" });
      }

      prevBtn.addEventListener("click", function () {
        stepRow(-1);
        track("service_row_nav", { direction: "prev", category: row.getAttribute("data-service-group") });
      });
      nextBtn.addEventListener("click", function () {
        stepRow(1);
        track("service_row_nav", { direction: "next", category: row.getAttribute("data-service-group") });
      });
      row.addEventListener("scroll", updateButtons);
      window.addEventListener("resize", updateButtons);
      updateButtons();

      // A "scroll" or window "resize" event isn't the only thing that can
      // change how much there is left to scroll -- late web-font swap,
      // an image finishing decode, or anything else reflowing the row
      // changes scrollWidth/clientWidth without firing either. Without
      // this, updateButtons()'s one-time initial read can go stale and
      // leave an arrow disabled (or enabled) when reality has since
      // moved on. ResizeObserver is exactly the primitive for "recompute
      // whenever this element's box actually changes," so it's a
      // correctness fix, not just a nice-to-have.
      if ("ResizeObserver" in window) {
        new ResizeObserver(updateButtons).observe(row);
      }

      // Mouse click-and-drag scrolling -- touch swipe, trackpad and
      // keyboard scrolling already work natively via plain overflow-x
      // scrolling, but a held-mouse-button drag doesn't on a plain div.
      // A drag past a small pixel threshold marks `dragged`, which the
      // capture-phase click listener below uses to swallow the click a
      // drag would otherwise fire on release -- without it, every drag
      // would also pop open whichever tile the pointer happened to land
      // on. Deliberately NOT using setPointerCapture: capturing the
      // pointer on the row redirects the click event's own target
      // resolution to the row instead of the tile underneath it in this
      // browser's implementation, which broke every tile click, dragged
      // or not. window-level move/up listeners (only doing anything
      // while `isDragging`) give the same "keep tracking outside the
      // row's bounds" behaviour without that side effect.
      var isDragging = false;
      var dragged = false;
      var dragStartX = 0;
      var dragStartScroll = 0;

      row.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "mouse") return;
        isDragging = true;
        dragged = false;
        dragStartX = e.clientX;
        dragStartScroll = row.scrollLeft;
      });
      window.addEventListener("pointermove", function (e) {
        if (!isDragging) return;
        var delta = e.clientX - dragStartX;
        if (Math.abs(delta) > 4) dragged = true;
        row.scrollLeft = dragStartScroll - delta;
      });
      window.addEventListener("pointerup", function () { isDragging = false; });
      window.addEventListener("pointercancel", function () { isDragging = false; });
      row.addEventListener(
        "click",
        function (e) {
          if (dragged) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true
      );
    });

    // Click tracking: WhatsApp, phone, downloads
    document.querySelectorAll('a[href^="https://wa.me"]').forEach(function (a) {
      a.addEventListener("click", function () {
        track("whatsapp_click", { link_url: a.href, link_text: a.textContent.trim() });
      });
    });
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      a.addEventListener("click", function () {
        track("phone_click", { link_url: a.href });
      });
    });
    document.querySelectorAll("a[data-download]").forEach(function (a) {
      a.addEventListener("click", function () {
        track("download", { file: a.getAttribute("data-download") });
      });
    });

    // Generic Netlify-form submission handler — every form on the site
    // carries class "js-form" and a data-form-id used for analytics + the
    // status message it should show on success.
    function encodeFormData(data) {
      return Array.from(data.entries())
        .map(function (pair) {
          return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
        })
        .join("&");
    }

    // Netlify form name -> the intake_submissions.form_type this becomes
    // once a Supabase project is configured (see js/supabase-config.js).
    var SUPABASE_FORM_TYPE = {
      "adorworks-talent": "talent_application",
      "adorworks-employer": "employer_brief",
      "adorworks-service": "service_request",
      "adorworks-contact": "general_contact",
      "adorworks-insights-subscribe": "insights_subscribe",
    };

    function supabaseConfigured() {
      return Boolean(window.ADORWORKS_SUPABASE_URL && window.ADORWORKS_SUPABASE_ANON_KEY);
    }

    function submitToSupabase(form, data) {
      var formType = SUPABASE_FORM_TYPE[form.getAttribute("name")];
      if (!formType) {
        return Promise.reject(new Error("No Supabase form_type mapped for this form."));
      }
      var payload = {};
      data.forEach(function (value, key) {
        if (key === "form-name" || key === "bot-field") return;
        payload[key] = value;
      });
      return fetch(window.ADORWORKS_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/intake_submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: window.ADORWORKS_SUPABASE_ANON_KEY,
          Authorization: "Bearer " + window.ADORWORKS_SUPABASE_ANON_KEY,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ form_type: formType, payload: payload }),
      });
    }

    function submitToNetlify(data) {
      return fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeFormData(data),
      });
    }

    document.querySelectorAll("form.js-form").forEach(function (form) {
      var formId = form.getAttribute("data-form-id") || form.getAttribute("name") || "form";
      var status = form.querySelector(".form-status") || document.getElementById(form.getAttribute("aria-describedby") || "");
      var successMessage = form.getAttribute("data-success-message") ||
        "Thanks — we've received this and a member of the AdorWorks team will follow up.";

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var data = new FormData(form);

        // Silent honeypot: a filled hidden field means a bot filled the
        // form. Netlify checks this server-side on its own path, but a
        // direct-to-Supabase submission needs the same check done here.
        if (data.get("bot-field")) {
          form.reset();
          showStatus("success", successMessage);
          return;
        }

        var submission = supabaseConfigured() ? submitToSupabase(form, data) : submitToNetlify(data);

        submission
          .then(function (res) {
            if (res.ok) {
              track("form_submit", { form_id: formId });
              form.reset();
              showStatus("success", successMessage);
            } else {
              showStatus(
                "error",
                "Something went wrong sending that. Please try WhatsApp instead."
              );
            }
          })
          .catch(function () {
            showStatus(
              "error",
              "Something went wrong sending that. Please try WhatsApp instead."
            );
          });
      });

      function showStatus(kind, message) {
        if (!status) return;
        status.textContent = message;
        status.className = "form-status is-visible " + kind;
        status.setAttribute("role", "status");
      }
    });

    // Scroll reveal: cards and section content fade/rise gently into
    // place as they enter the viewport (restrained -- no bounce, no
    // looping, short distance/duration -- matching this file's existing
    // "mobile-first, restrained animation" principle). Progressive
    // enhancement only: the .reveal class -- the thing that actually
    // hides content pre-animation -- is added by this script, so with
    // JS disabled or IntersectionObserver unsupported, content is just
    // visible with no animation, never stuck hidden. Skipped entirely
    // under prefers-reduced-motion rather than animated then hidden.
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var revealTargets = document.querySelectorAll(
      ".card, .step, .category-banner, .notice, .service-tile, .tier-card"
    );
    if (revealTargets.length && "IntersectionObserver" in window && !reduceMotion) {
      revealTargets.forEach(function (el) { el.classList.add("reveal"); });

      // Stagger by position among reveal-eligible siblings (capped) so a
      // row of cards cascades in rather than popping simultaneously.
      var groups = new Map();
      revealTargets.forEach(function (el) {
        var parent = el.parentElement || document.body;
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push(el);
      });
      groups.forEach(function (siblings) {
        siblings.forEach(function (el, index) {
          el.style.transitionDelay = (Math.min(index, 5) * 70) + "ms";
        });
      });

      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );
      revealTargets.forEach(function (el) { revealObserver.observe(el); });
    }

    // Coverflow (homepage "five ways to work"): index-driven, not
    // scroll-driven -- one activeIndex, written to every slide as the
    // --offset custom property (its position relative to the active
    // card); styles.css turns that single number into the whole
    // centred/sharp vs. receding/blurred/rotated presentation via
    // calc(), so this file only ever manages one integer.
    var coverflow = document.querySelector("[data-coverflow]");
    if (coverflow) {
      var cfSlides = Array.from(coverflow.querySelectorAll("[data-coverflow-slide]"));
      var cfPrev = coverflow.querySelector("[data-coverflow-prev]");
      var cfNext = coverflow.querySelector("[data-coverflow-next]");
      var cfDots = Array.from(coverflow.querySelectorAll("[data-coverflow-dot]"));
      var cfStage = coverflow.querySelector("[data-coverflow-stage]");
      // Leads with the highlighted "Post a project" card (index 1) rather
      // than card 0 -- the flagship path stays front and centre without
      // requiring a visitor to interact first.
      var cfActiveIndex = 1;

      function renderCoverflow() {
        cfSlides.forEach(function (slide, i) {
          var offset = i - cfActiveIndex;
          var isActive = offset === 0;
          slide.style.setProperty("--offset", String(offset));
          slide.dataset.active = String(isActive);
          slide.setAttribute("aria-hidden", isActive ? "false" : "true");
          slide.querySelectorAll("a").forEach(function (a) {
            a.tabIndex = isActive ? 0 : -1;
          });
        });
        if (cfPrev) cfPrev.disabled = cfActiveIndex <= 0;
        if (cfNext) cfNext.disabled = cfActiveIndex >= cfSlides.length - 1;
        cfDots.forEach(function (dot, i) {
          dot.setAttribute("aria-selected", String(i === cfActiveIndex));
        });
      }

      function goToCoverflow(index) {
        var clamped = Math.max(0, Math.min(cfSlides.length - 1, index));
        if (clamped === cfActiveIndex) return;
        cfActiveIndex = clamped;
        renderCoverflow();
        track("path_coverflow_select", { index: cfActiveIndex });
      }

      if (cfPrev) cfPrev.addEventListener("click", function () { goToCoverflow(cfActiveIndex - 1); });
      if (cfNext) cfNext.addEventListener("click", function () { goToCoverflow(cfActiveIndex + 1); });
      cfDots.forEach(function (dot, i) {
        dot.addEventListener("click", function () { goToCoverflow(i); });
      });

      // Selecting a non-active card re-centres it instead of following
      // its link -- its links are already out of tab order (tabIndex -1
      // above) while inactive, so this only needs to catch the mouse/
      // touch case. The active card's own links are left alone and
      // navigate normally.
      cfSlides.forEach(function (slide, i) {
        slide.addEventListener("click", function (e) {
          if (i !== cfActiveIndex) {
            e.preventDefault();
            goToCoverflow(i);
          }
        });
      });

      if (cfStage) {
        cfStage.addEventListener("keydown", function (e) {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            goToCoverflow(cfActiveIndex - 1);
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            goToCoverflow(cfActiveIndex + 1);
          }
        });
      }

      renderCoverflow();
    }
  });
})();
