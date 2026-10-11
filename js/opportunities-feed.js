/*
  Fetches the live, public opportunity board for jobs-projects.html directly
  from Supabase via REST + the anon key (same pattern as js/supabase-config.js
  uses for intake forms). RLS on the `opportunities` table already restricts
  anon reads to status=open AND visibility=public rows only, so this never
  needs the backend/api server.

  Progressive enhancement: the markup already contains the "founding pilot,
  no open opportunities yet" block as its default, meaningful state. We only
  swap it out once real data is confirmed, and if the fetch fails (offline,
  RLS change, etc.) that default block simply stays visible — no loading
  flash of an empty grid.
*/
(function () {
  "use strict";

  var TYPE_LABEL = {
    freelance: "Freelance project",
    fixed_term_contract: "Contract",
    full_time: "Full-time",
    internship: "Internship",
    apprenticeship: "Apprenticeship",
    managed_service: "Managed opportunity",
  };

  var WORK_MODE_LABEL = {
    remote: "Remote",
    on_site: "On-site",
    hybrid: "Hybrid",
    any: "Flexible",
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatCompensation(o) {
    if (!o.currency) return null;
    var fmt = function (n) {
      return Number(n).toLocaleString("en-US");
    };
    if (o.compensation_amount != null) return o.currency + " " + fmt(o.compensation_amount);
    if (o.compensation_min != null && o.compensation_max != null) {
      return o.currency + " " + fmt(o.compensation_min) + "–" + fmt(o.compensation_max);
    }
    return null;
  }

  function formatClosingDate(value) {
    if (!value) return null;
    var d = new Date(value + "T00:00:00Z");
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function opportunityCard(o) {
    var typeLabel = TYPE_LABEL[o.engagement_type] || o.engagement_type;
    var modeLabel = WORK_MODE_LABEL[o.work_mode] || o.work_mode;
    var comp = formatCompensation(o);
    var closing = formatClosingDate(o.application_deadline);
    var skills = Array.isArray(o.skills) ? o.skills.slice(0, 6) : [];

    var metaParts = [];
    if (modeLabel) metaParts.push('<span class="badge">' + escapeHtml(modeLabel) + "</span>");
    if (o.location) metaParts.push('<span class="badge badge-violet">' + escapeHtml(o.location) + "</span>");

    var html = '<div class="card opportunity-card" data-engagement-type="' + escapeHtml(o.engagement_type) + '">';
    html += "<h3>" + escapeHtml(o.title) + "</h3>";
    html += '<p class="mt-0" style="font-weight:700;color:var(--color-secondary);">' + escapeHtml(typeLabel) + "</p>";
    if (metaParts.length) html += '<div class="opportunity-meta">' + metaParts.join("") + "</div>";
    if (skills.length) {
      html +=
        '<div class="opportunity-skills">' +
        skills.map(function (s) { return '<span class="skill-tag">' + escapeHtml(s) + "</span>"; }).join("") +
        "</div>";
    }
    if (comp) html += '<p class="mt-0">' + escapeHtml(comp) + "</p>";
    if (closing) html += '<p class="opportunity-closing mt-0 mb-0">Closes ' + escapeHtml(closing) + "</p>";
    html += '<p class="mt-0 mb-0"><a href="for-talent.html#talent-form">Build a profile to be considered &rarr;</a></p>';
    html += "</div>";
    return html;
  }

  function applyFilter(listEl, emptyEl, activeFilter) {
    var cards = listEl.querySelectorAll(".opportunity-card");
    var visibleCount = 0;
    cards.forEach(function (card) {
      var matches = activeFilter === "all" || card.getAttribute("data-engagement-type") === activeFilter;
      card.style.display = matches ? "" : "none";
      if (matches) visibleCount += 1;
    });
    listEl.hidden = visibleCount === 0;
    emptyEl.hidden = visibleCount !== 0;
  }

  function wireFilterBar(listEl, filterEmptyEl) {
    var bar = document.getElementById("opportunity-filter-bar");
    if (!bar) return;
    bar.addEventListener("click", function (event) {
      var chip = event.target.closest(".filter-chip");
      if (!chip) return;
      bar.querySelectorAll(".filter-chip").forEach(function (c) {
        c.setAttribute("aria-pressed", String(c === chip));
      });
      applyFilter(listEl, filterEmptyEl, chip.getAttribute("data-filter"));
    });
  }

  function init() {
    var listEl = document.getElementById("opportunity-list");
    var emptyEl = document.getElementById("opportunity-empty");
    var filterEmptyEl = document.getElementById("opportunity-filter-empty");
    if (!listEl || !emptyEl) return;
    if (!window.ADORWORKS_SUPABASE_URL || !window.ADORWORKS_SUPABASE_ANON_KEY) return;

    var endpoint =
      window.ADORWORKS_SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/opportunities?select=id,title,engagement_type,work_mode,location,skills,compensation_amount,compensation_min,compensation_max,currency,application_deadline,created_at&status=eq.open&visibility=eq.public&order=created_at.desc";

    fetch(endpoint, {
      headers: {
        apikey: window.ADORWORKS_SUPABASE_ANON_KEY,
        Authorization: "Bearer " + window.ADORWORKS_SUPABASE_ANON_KEY,
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed: " + res.status);
        return res.json();
      })
      .then(function (opportunities) {
        if (!Array.isArray(opportunities) || opportunities.length === 0) return;
        listEl.innerHTML = opportunities.map(opportunityCard).join("");
        listEl.hidden = false;
        emptyEl.hidden = true;
        if (filterEmptyEl) wireFilterBar(listEl, filterEmptyEl);
      })
      .catch(function () {
        // Fetch failed — leave the default "founding pilot" block visible.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
