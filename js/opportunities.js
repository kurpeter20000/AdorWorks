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

  var opportunities = [];
  var orgs = {};
  var activeFilter = "all";

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
    return node;
  }

  function renderCard(o) {
    var card = el("article", "card opportunity-card");

    var head = el("div", "opportunity-head");
    var titleWrap = el("div");
    var title = el("h3", "opportunity-title");
    var titleLink = userText("a", null, o.title);
    titleLink.id = "opp-title-" + o.id;
    titleLink.href = PLATFORM_URL + "/jobs/" + encodeURIComponent(o.id);
    title.appendChild(titleLink);
    titleWrap.appendChild(title);
    var org = orgs[o.organisation_id];
    var employer = el("p", "opportunity-employer");
    if (org && org.name) employer.appendChild(userText("span", null, org.name));
    else employer.appendChild(el("span", null, "AdorWorks employer"));
    if (org && org.verification_status === "verified") {
      employer.appendChild(el("span", "opportunity-verified", "Verified"));
    }
    titleWrap.appendChild(employer);
    head.appendChild(titleWrap);
    var amount = o.compensation_amount || (o.compensation_min && o.compensation_max);
    head.appendChild(amount ? userText("p", "opportunity-pay", formatCompensation(o)) : el("p", "opportunity-pay", formatCompensation(o)));
    card.appendChild(head);

    if (o.brief) card.appendChild(userText("p", "opportunity-brief", o.brief));

    if (o.skills && o.skills.length) {
      var skills = el("ul", "opportunity-skills");
      skills.setAttribute("aria-label", "Required skills");
      o.skills.slice(0, 6).forEach(function (s) {
        skills.appendChild(userText("li", null, s));
      });
      card.appendChild(skills);
    }

    // Each part is its own element so labels translate and places/dates don't.
    var parts = [];
    if (ENGAGEMENT_LABEL[o.engagement_type]) parts.push(el("span", null, ENGAGEMENT_LABEL[o.engagement_type]));
    if (WORK_MODE_LABEL[o.work_mode]) parts.push(el("span", null, WORK_MODE_LABEL[o.work_mode]));
    if (o.location) parts.push(userText("span", null, o.location));
    if (o.application_deadline) {
      var by = el("span");
      by.appendChild(el("span", null, "Apply by"));
      by.appendChild(document.createTextNode(" "));
      by.appendChild(userText("span", null, formatDate(o.application_deadline)));
      parts.push(by);
    }
    var metaLine = el("p", "opportunity-meta");
    parts.forEach(function (p, i) {
      if (i) metaLine.appendChild(document.createTextNode(" · "));
      metaLine.appendChild(p);
    });

    var foot = el("div", "opportunity-foot");
    foot.appendChild(metaLine);
    var apply = el("a", "btn btn-primary opportunity-apply", "View & apply");
    apply.href = PLATFORM_URL + "/jobs/" + encodeURIComponent(o.id);
    apply.setAttribute("aria-describedby", titleLink.id);
    foot.appendChild(apply);
    card.appendChild(foot);

    return card;
  }

  function render() {
    var visible = opportunities.filter(function (o) {
      return activeFilter === "all" || o.engagement_type === activeFilter;
    });

    list.textContent = "";
    visible.forEach(function (o) {
      list.appendChild(renderCard(o));
    });

    list.hidden = visible.length === 0;
    filterEmpty.hidden = visible.length !== 0;
    countEl.hidden = false;
    countEl.textContent =
      visible.length === 1 ? "1 open opportunity" : visible.length + " open opportunities";

    document.querySelectorAll(".filter-bar .filter-chip").forEach(function (chip) {
      chip.setAttribute("aria-pressed", String(chip.getAttribute("data-filter") === activeFilter));
    });
  }

  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeFilter = btn.getAttribute("data-filter");
      if (opportunities.length) render();
    });
  });

  get(
    "opportunities?select=id,title,brief,skills,location,work_mode,engagement_type,payment_basis," +
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
