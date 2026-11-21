/*
  Live listings for jobs-projects.html: open + public opportunities, read
  with the public publishable key — the same rows opportunities_select RLS
  already lets anyone see. Every value is inserted as text, never HTML,
  since titles/briefs are employer-supplied. If the request fails or
  nothing is open, the page's static "No open opportunities" panel stays.
*/
(function () {
  "use strict";

  var list = document.getElementById("opportunity-list");
  var pending = document.getElementById("opportunity-pending");
  var countEl = document.getElementById("opportunity-count");
  var filterEmpty = document.getElementById("opportunity-filter-empty");
  if (!list || !window.ADORWORKS_SUPABASE_URL || !window.ADORWORKS_SUPABASE_ANON_KEY) return;

  var PLATFORM_URL = "https://ador-works.vercel.app";
  var API = window.ADORWORKS_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/";
  var HEADERS = {
    apikey: window.ADORWORKS_SUPABASE_ANON_KEY,
    Authorization: "Bearer " + window.ADORWORKS_SUPABASE_ANON_KEY,
  };

  var ENGAGEMENT_LABEL = {
    freelance: "Freelance project",
    fixed_term_contract: "Contract",
    full_time: "Full-time",
    internship: "Internship",
    apprenticeship: "Apprenticeship",
    managed_service: "Managed opportunity",
  };
  var WORK_MODE_LABEL = { remote: "Remote", on_site: "On-site", hybrid: "Hybrid", any: "Any work mode" };

  var CATEGORY_LABEL = { creative_media: "Creative & media", digital_technology: "Digital & technology", business_project_support: "Business & project support" };

  var opportunities = [];
  var orgs = {};
  var activeFilter = "all";
  // Redesign (2026): search, work mode, category and sort, all optional
  // so the script still works on a page without them.
  var searchInput = document.getElementById("job-search");
  var modeSelect = document.getElementById("job-mode");
  var categorySelect = document.getElementById("job-category");
  var sortSelect = document.getElementById("job-sort");

  function get(path) {
    return fetch(API + path, { headers: HEADERS }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  // Short amounts: 250,000 -> 250K, 2,500,000 -> 2.5M. The exact figure
  // stays in the card's accessible label and on the job page.
  function compactMoney(n) {
    n = Number(n);
    var trim = function (x) { return String(Math.round(x * 10) / 10); };
    if (n >= 1e6) return trim(n / 1e6) + "M";
    if (n >= 1e3) return trim(n / 1e3) + "K";
    return String(n);
  }

  function exactMoney(n) {
    return Number(n).toLocaleString("en-US");
  }

  function formatCompensation(o, fmt) {
    fmt = fmt || compactMoney;
    var currency = o.currency || "SSP";
    if (o.compensation_amount) return currency + " " + fmt(o.compensation_amount);
    if (o.compensation_min && o.compensation_max) {
      return currency + " " + fmt(o.compensation_min) + "–" + fmt(o.compensation_max);
    }
    if (o.payment_basis === "negotiable") return "Negotiable";
    return "Paid — details on application";
  }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function isStillOpen(o) {
    if (!o.application_deadline) return true;
    var deadline = new Date(o.application_deadline);
    deadline.setHours(23, 59, 59, 999);
    return deadline.getTime() >= Date.now();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // Employer-written content (titles, names, briefs, skills, places) is
  // marked no-i18n so the translation layer (js/i18n.js) never rewrites
  // it; only AdorWorks' own labels around it are translated.
  function userText(tag, className, text) {
    var node = el(tag, className ? className + " no-i18n" : "no-i18n", text);
    // Employer text may be in another script from the page (English
    // inside Arabic): let the browser set its direction from the text.
    node.setAttribute("dir", "auto");
    return node;
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  var ICONS = {
    pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    check: "M5 12.5l4.5 4.5L19 7.5",
  };
  function icon(name, className) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className || "job-icon");
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  function daysLeft(value) {
    if (!value) return null;
    var end = new Date(value);
    end.setHours(23, 59, 59, 999);
    return Math.ceil((end.getTime() - Date.now()) / 86400000);
  }

  function renderCard(o) {
    var card = el("article", "job-card");
    if (o.category) card.setAttribute("data-category", o.category);
    var org = orgs[o.organisation_id];
    var orgName = org && org.name ? org.name : null;
    var href = PLATFORM_URL + "/jobs/" + encodeURIComponent(o.id);

    // Employer and engagement type
    var head = el("div", "job-card-head");
    head.appendChild(el("span", "job-initial no-i18n", (orgName || "A").trim().charAt(0).toUpperCase()));
    var who = el("span", "job-org");
    var nameNode = orgName ? userText("span", "job-org-name", orgName) : el("span", "job-org-name", "AdorWorks employer");
    if (orgName) nameNode.title = orgName;
    who.appendChild(nameNode);
    if (org && org.verification_status === "verified") {
      var verified = el("span", "job-verified");
      verified.appendChild(icon("check", "job-icon job-icon-check"));
      verified.appendChild(el("span", null, "Verified employer"));
      who.appendChild(verified);
    }
    head.appendChild(who);
    card.appendChild(head);

    // A list, so each tag is translated on its own.
    var tags = el("ul", "job-tags");
    if (ENGAGEMENT_LABEL[o.engagement_type]) tags.appendChild(el("li", "job-type", ENGAGEMENT_LABEL[o.engagement_type]));
    if (WORK_MODE_LABEL[o.work_mode] && o.work_mode !== "any") tags.appendChild(el("li", "job-mode", WORK_MODE_LABEL[o.work_mode]));
    if (tags.childNodes.length) card.appendChild(tags);

    var title = el("h3", "job-title");
    var titleLink = userText("a", null, o.title);
    titleLink.id = "opp-title-" + o.id;
    titleLink.href = href;
    title.appendChild(titleLink);
    card.appendChild(title);

    if (o.brief) card.appendChild(userText("p", "job-brief", o.brief));

    // Pay, large; where and when beside it. Labels translate; employer
    // values don't.
    var facts = el("dl", "job-facts");
    var payBox = el("div", "job-pay");
    payBox.appendChild(el("dt", null, "Pay"));
    var amount = o.compensation_amount || (o.compensation_min && o.compensation_max);
    var payValue = amount ? userText("dd", null, formatCompensation(o)) : el("dd", "job-pay-text", formatCompensation(o));
    if (amount) {
      payValue.setAttribute("title", formatCompensation(o, exactMoney));
      payValue.setAttribute("aria-label", formatCompensation(o, exactMoney));
    }
    payBox.appendChild(payValue);
    facts.appendChild(payBox);

    var meta = el("div", "job-meta");
    var whereRow = el("div", "job-meta-row");
    var whereLabel = el("dt", "visually-hidden", "Where");
    var whereValue = el("dd");
    whereValue.appendChild(icon("pin"));
    if (o.location) whereValue.appendChild(userText("span", null, o.location));
    else whereValue.appendChild(el("span", null, WORK_MODE_LABEL[o.work_mode] || "—"));
    whereRow.appendChild(whereLabel);
    whereRow.appendChild(whereValue);
    meta.appendChild(whereRow);

    var closeRow = el("div", "job-meta-row");
    closeRow.appendChild(el("dt", "visually-hidden", "Closes"));
    var closeValue = el("dd");
    closeValue.appendChild(icon("calendar"));
    var left = daysLeft(o.application_deadline);
    if (o.application_deadline) {
      closeValue.appendChild(el("span", null, "Closes"));
      closeValue.appendChild(document.createTextNode(" "));
      closeValue.appendChild(userText("span", null, formatDate(o.application_deadline)));
      if (left !== null && left <= 7) closeRow.classList.add("is-soon");
    } else {
      closeValue.appendChild(el("span", null, "Open until filled"));
    }
    closeRow.appendChild(closeValue);
    meta.appendChild(closeRow);
    facts.appendChild(meta);
    card.appendChild(facts);

    if (o.skills && o.skills.length) {
      var skills = el("ul", "job-skills");
      skills.setAttribute("aria-label", "Required skills");
      var shown = 3;
      o.skills.slice(0, shown).forEach(function (sk) {
        skills.appendChild(userText("li", null, sk));
      });
      if (o.skills.length > shown) {
        var more = el("li", "job-skills-more no-i18n", "+" + (o.skills.length - shown));
        more.title = o.skills.slice(shown).join(", ");
        skills.appendChild(more);
      }
      card.appendChild(skills);
    }

    var foot = el("div", "job-foot");
    if (CATEGORY_LABEL[o.category]) foot.appendChild(el("p", "job-category", CATEGORY_LABEL[o.category]));
    var apply = el("a", "job-apply", "View and apply →");
    apply.href = href;
    apply.setAttribute("aria-describedby", titleLink.id);
    foot.appendChild(apply);
    card.appendChild(foot);

    return card;
  }

  function matchesSearch(o, q) {
    if (!q) return true;
    var org = orgs[o.organisation_id];
    var hay = [o.title, o.brief, o.location, (o.skills || []).join(" "), org && org.name].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (word) { return hay.indexOf(word) !== -1; });
  }

  function render() {
    var q = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var mode = modeSelect ? modeSelect.value : "";
    var category = categorySelect ? categorySelect.value : "";
    var visible = opportunities.filter(function (o) {
      return (activeFilter === "all" || o.engagement_type === activeFilter) &&
        (!mode || o.work_mode === mode) &&
        (!category || o.category === category) &&
        matchesSearch(o, q);
    });
    if (sortSelect && sortSelect.value === "closing") {
      visible = visible.slice().sort(function (a, b) {
        if (!a.application_deadline) return 1;
        if (!b.application_deadline) return -1;
        return new Date(a.application_deadline) - new Date(b.application_deadline);
      });
    }

    list.textContent = "";
    visible.forEach(function (o) {
      list.appendChild(renderCard(o));
    });

    list.hidden = visible.length === 0;
    filterEmpty.hidden = visible.length !== 0;
    countEl.hidden = false;
    // The number is kept apart from the words so the words translate
    // once, whatever the count.
    countEl.textContent = "";
    countEl.appendChild(el("strong", "no-i18n", String(visible.length)));
    countEl.appendChild(document.createTextNode(visible.length === 1 ? " open opportunity" : " open opportunities"));

    document.querySelectorAll(".filter-bar .filter-chip").forEach(function (chip) {
      chip.setAttribute("aria-pressed", String(chip.getAttribute("data-filter") === activeFilter));
    });
  }

  [searchInput, modeSelect, categorySelect, sortSelect].forEach(function (input) {
    if (!input) return;
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", function () {
      if (opportunities.length) render();
    });
  });
  // Arriving from the homepage search (?q=…) fills the box.
  if (searchInput) {
    var fromUrl = new URLSearchParams(location.search).get("q");
    if (fromUrl) searchInput.value = fromUrl;
  }

  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeFilter = btn.getAttribute("data-filter");
      if (opportunities.length) render();
    });
  });

  get(
    "opportunities?select=id,title,brief,skills,location,work_mode,engagement_type,category,payment_basis," +
      "compensation_amount,compensation_min,compensation_max,currency,application_deadline,organisation_id" +
      "&status=eq.open&visibility=eq.public&order=created_at.desc&limit=50"
  )
    .then(function (rows) {
      opportunities = rows.filter(isStillOpen);
      if (!opportunities.length) return;

      var orgIds = opportunities
        .map(function (o) { return o.organisation_id; })
        .filter(function (id, i, all) { return id && all.indexOf(id) === i; });

      // Employer names are a nice-to-have: listings render even if this fails.
      return get("public_organisation_names?select=id,name,verification_status&id=in.(" + orgIds.join(",") + ")")
        .then(function (orgRows) {
          orgRows.forEach(function (row) { orgs[row.id] = row; });
        })
        .catch(function () {})
        .then(function () {
          pending.hidden = true;
          render();
        });
    })
    .catch(function () {
      // Leave the static "No open opportunities" panel in place.
    });
})();
