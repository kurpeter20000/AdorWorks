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

  function formatMoney(n) {
    return Number(n).toLocaleString("en-US");
  }

  function formatCompensation(o) {
    var currency = o.currency || "SSP";
    if (o.compensation_amount) return currency + " " + formatMoney(o.compensation_amount);
    if (o.compensation_min && o.compensation_max) {
      return currency + " " + formatMoney(o.compensation_min) + "–" + formatMoney(o.compensation_max);
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

  function renderCard(o) {
    var card = el("article", "job-card");
    var org = orgs[o.organisation_id];
    var orgName = org && org.name ? org.name : null;

    var head = el("div", "job-card-head");
    head.appendChild(el("span", "job-initial no-i18n", (orgName || "A").trim().charAt(0).toUpperCase()));
    var who = el("span", "job-org");
    who.appendChild(orgName ? userText("span", "job-org-name", orgName) : el("span", "job-org-name", "AdorWorks employer"));
    if (org && org.verification_status === "verified") who.appendChild(el("span", "job-verified", "Verified employer"));
    head.appendChild(who);
    if (ENGAGEMENT_LABEL[o.engagement_type]) head.appendChild(el("span", "job-type", ENGAGEMENT_LABEL[o.engagement_type]));
    card.appendChild(head);

    var title = el("h3", "job-title");
    var titleLink = userText("a", null, o.title);
    titleLink.id = "opp-title-" + o.id;
    titleLink.href = PLATFORM_URL + "/jobs/" + encodeURIComponent(o.id);
    title.appendChild(titleLink);
    card.appendChild(title);

    // Pay · Where · Closes — labels translate; employer values don't.
    var facts = el("dl", "job-facts");
    function fact(label, valueNode) {
      var d = el("div");
      d.appendChild(el("dt", null, label));
      var dd = el("dd");
      dd.appendChild(valueNode);
      d.appendChild(dd);
      facts.appendChild(d);
    }
    var amount = o.compensation_amount || (o.compensation_min && o.compensation_max);
    fact("Pay", amount ? userText("span", null, formatCompensation(o)) : el("span", null, formatCompensation(o)));
    var where = el("span");
    if (WORK_MODE_LABEL[o.work_mode]) where.appendChild(el("span", null, WORK_MODE_LABEL[o.work_mode]));
    if (o.location) {
      if (where.childNodes.length) where.appendChild(document.createTextNode(" · "));
      where.appendChild(userText("span", null, o.location));
    }
    if (!where.childNodes.length) where.appendChild(el("span", null, "—"));
    fact("Where", where);
    fact("Closes", o.application_deadline ? userText("span", null, formatDate(o.application_deadline)) : el("span", null, "Open"));
    card.appendChild(facts);

    if (o.brief) card.appendChild(userText("p", "job-brief", o.brief));

    if (o.skills && o.skills.length) {
      var skills = el("ul", "job-skills");
      skills.setAttribute("aria-label", "Required skills");
      o.skills.slice(0, 6).forEach(function (sk) {
        skills.appendChild(userText("li", null, sk));
      });
      card.appendChild(skills);
    }

    var foot = el("div", "job-foot");
    if (CATEGORY_LABEL[o.category]) foot.appendChild(el("p", "job-category", CATEGORY_LABEL[o.category]));
    var apply = el("a", "job-apply", "View and apply →");
    apply.href = PLATFORM_URL + "/jobs/" + encodeURIComponent(o.id);
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
