import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge, supabase } from "./app.js";

initLogout();

var rows = [];
var filters = { category: "", tier: "" };

var auth = await requireStaffSession();
if (auth) {
  wireFilters();
  await load();
  await loadPendingVideos();
}

// Stage 6's Operations review queue — see backend/api/src/routes/
// talent.js's GET /pending-videos comment for why this exists as its own
// panel rather than requiring staff to already know which talent to open.
// Reuses toggleDetail/refreshDetail (defined below) by building the same
// data-row-id / detail-row pair shape the main table uses — those
// functions look up elements by id globally, not scoped to one table.
async function loadPendingVideos() {
  var section = document.getElementById("pending-videos-section");
  var tbody = document.getElementById("pending-videos-body");
  try {
    var res = await apiFetch("/api/talent/pending-videos");
    if (!res.data.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    tbody.innerHTML = res.data
      .map(function (v) {
        return (
          '<tr class="is-clickable" data-row-id="' + v.talent_id + '">' +
          "<td>" + escapeHtml(v.talent_profiles?.headline || v.talent_id) + "</td>" +
          "<td>" + escapeHtml((v.talent_profiles?.category || "—").replace(/_/g, " ")) + "</td>" +
          "<td>" + formatDate(v.created_at) + "</td>" +
          "</tr>" +
          '<tr class="detail-row" id="detail-' + v.talent_id + '"><td colspan="3"></td></tr>'
        );
      })
      .join("");
    tbody.querySelectorAll("tr[data-row-id]").forEach(function (tr) {
      tr.addEventListener("click", function () { toggleDetail(tr.getAttribute("data-row-id")); });
    });
  } catch (err) {
    section.hidden = true;
  }
}

function wireFilters() {
  document.getElementById("category-select").addEventListener("change", function (e) {
    filters.category = e.target.value;
    load();
  });
  document.getElementById("tier-select").addEventListener("change", function (e) {
    filters.tier = e.target.value;
    load();
  });
}

function query(params) {
  var usp = new URLSearchParams();
  Object.entries(params).forEach(function ([k, v]) { if (v) usp.set(k, v); });
  var s = usp.toString();
  return s ? "?" + s : "";
}

async function load() {
  var tbody = document.getElementById("talent-body");
  tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Loading…</td></tr>';
  try {
    var res = await apiFetch("/api/talent" + query(Object.assign({ limit: 100 }, filters)));
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("talent-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">No talent profiles match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.headline || row.profiles?.full_name || "—") + "</td>" +
        "<td>" + escapeHtml((row.category || "—").replace(/_/g, " ")) + "</td>" +
        "<td>" + statusBadge(row.verification_tier) + "</td>" +
        "<td>" + escapeHtml(row.location || "—") + "</td>" +
        '<td>' + (row.public_visible ? '<span class="status-badge status-success">Public</span>' : '<span class="status-badge status-neutral">Hidden</span>') + "</td>" +
        "</tr>" +
        '<tr class="detail-row" id="detail-' + row.id + '"><td colspan="5"></td></tr>'
      );
    })
    .join("");

  tbody.querySelectorAll("tr[data-row-id]").forEach(function (tr) {
    tr.addEventListener("click", function () { toggleDetail(tr.getAttribute("data-row-id")); });
  });
}

var TIERS = ["registered", "identity_verified", "adorverified", "adorcertified", "team_lead"];

async function toggleDetail(id) {
  var detailRow = document.getElementById("detail-" + id);
  var isOpen = detailRow.classList.contains("is-open");
  document.querySelectorAll("tr.detail-row.is-open").forEach(function (r) { r.classList.remove("is-open"); });
  if (isOpen) return;
  detailRow.classList.add("is-open");
  await refreshDetail(id);
}

async function refreshDetail(id) {
  var detailRow = document.getElementById("detail-" + id);
  detailRow.querySelector("td").innerHTML = "Loading…";
  try {
    var res = await apiFetch("/api/talent/" + id);
    detailRow.querySelector("td").innerHTML = renderDetail(res.data);
    wireDetailActions(id, res.data, detailRow);
  } catch (err) {
    detailRow.querySelector("td").innerHTML = '<p class="mb-0">' + escapeHtml(err.message) + "</p>";
  }
}

function renderDetail(d) {
  var p = d.profile;
  var contact = p.profiles ? p.profiles.full_name + " · " + (p.profiles.phone || "no phone on file") : "—";

  var v = d.introduction_video;
  var videoSection;
  if (!v) {
    videoSection = "<p>No introduction video submitted.</p>";
  } else {
    var videoActions = v.status === "pending"
      ? '<button type="button" class="btn btn-secondary" data-video-approve="' + p.id + '">Approve</button>' +
        '<input type="text" id="video-reject-reason-' + p.id + '" placeholder="Reason for rejecting (required)">' +
        '<button type="button" class="btn btn-secondary" data-video-reject="' + p.id + '">Reject</button>'
      : "";
    videoSection =
      "<p>" + statusBadge(v.status) + (v.status === "rejected" && v.rejection_reason ? " — " + escapeHtml(v.rejection_reason) : "") + "</p>" +
      (v.transcript ? '<p class="staff-hint">Transcript: ' + escapeHtml(v.transcript) + "</p>" : "") +
      '<div class="action-row">' +
      '<button type="button" class="btn btn-secondary" data-view-video="' + p.id + '" data-video-path="' + escapeHtml(v.video_path) + '">View video</button>' +
      videoActions +
      "</div>";
  }

  var evidenceItems = d.evidence.length
    ? d.evidence
        .map(function (e) {
          var actions = e.status === "pending"
            ? '<button type="button" class="btn btn-secondary" data-evidence-approve="' + e.id + '">Approve</button>' +
              '<button type="button" class="btn btn-secondary" data-evidence-reject="' + e.id + '">Reject</button>'
            : "";
          var viewButton = e.file_path
            ? '<button type="button" class="btn btn-secondary" data-view-evidence="' + e.id + '" data-evidence-path="' + escapeHtml(e.file_path) + '">View document</button>'
            : "";
          return (
            '<li><strong>' + escapeHtml(e.evidence_type) + "</strong> — " + statusBadge(e.status) +
            (e.notes ? "<br>" + escapeHtml(e.notes) : "") +
            '<div class="action-row">' + viewButton + actions + "</div></li>"
          );
        })
        .join("")
    : "<li>No evidence submitted yet.</li>";

  var historyItems = d.verification_history.length
    ? d.verification_history
        .map(function (v) {
          return (
            "<li><time>" + formatDate(v.created_at) + "</time>" +
            escapeHtml(v.old_tier || "(new)") + " &rarr; " + escapeHtml(v.new_tier) +
            (v.notes ? " — " + escapeHtml(v.notes) : "") + "</li>"
          );
        })
        .join("")
    : "<li>No tier changes yet.</li>";

  var tierOptions = TIERS.map(function (t) {
    return '<option value="' + t + '"' + (t === p.verification_tier ? " selected" : "") + ">" + t.replace(/_/g, " ") + "</option>";
  }).join("");

  return (
    '<div class="detail-grid detail-grid-2">' +
    "<div>" +
    '<dl class="kv-list">' +
    "<dt>Contact</dt><dd>" + escapeHtml(contact) + "</dd>" +
    "<dt>Bio</dt><dd>" + escapeHtml(p.bio || "—") + "</dd>" +
    "<dt>Skills</dt><dd>" + escapeHtml((p.skills || []).join(", ") || "—") + "</dd>" +
    "<dt>Languages</dt><dd>" + escapeHtml((p.languages || []).join(", ") || "—") + "</dd>" +
    "<dt>Work mode / availability</dt><dd>" + escapeHtml(p.work_mode || "—") + " · " + escapeHtml(p.availability || "—") + "</dd>" +
    "<dt>Rate</dt><dd>" + escapeHtml(p.rate_min || "—") + "–" + escapeHtml(p.rate_max || "—") + " " + escapeHtml(p.currency || "") + "</dd>" +
    "<dt>Portfolio</dt><dd>" + (p.portfolio_url ? '<a href="' + escapeHtml(p.portfolio_url) + '" target="_blank" rel="noopener">' + escapeHtml(p.portfolio_url) + "</a>" : "—") + "</dd>" +
    "</dl>" +
    "<div class=\"action-row\">" +
    '<label style="display:flex; align-items:center; gap:0.5em; font-weight:400;"><input type="checkbox" id="public-visible-' + p.id + '" ' + (p.public_visible ? "checked" : "") + "> Publicly visible</label>" +
    "</div>" +
    "</div>" +
    "<div>" +
    "<h3>Verification</h3>" +
    '<div class="form-grid form-grid-2">' +
    '<select id="tier-input-' + p.id + '">' + tierOptions + "</select>" +
    '<input type="text" id="tier-notes-' + p.id + '" placeholder="Notes (optional)">' +
    "</div>" +
    '<div class="action-row"><button type="button" class="btn btn-primary" data-set-tier="' + p.id + '">Update tier</button></div>' +
    "<h3 class=\"mt-1\">Introduction video</h3>" + videoSection +
    "<h3 class=\"mt-1\">Evidence</h3><ul class=\"staff-events\">" + evidenceItems + "</ul>" +
    "<h3 class=\"mt-1\">Tier history</h3><ul class=\"staff-events\">" + historyItems + "</ul>" +
    "</div>" +
    "</div>" +
    '<div class="form-status" id="detail-status-' + p.id + '" role="status"></div>'
  );
}

function wireDetailActions(id, d, detailRow) {
  // Looked up fresh each call (not cached) — refreshDetail() replaces the
  // detail row's innerHTML, which would detach a cached reference.
  function showStatus(kind, message) {
    var statusEl = detailRow.querySelector("#detail-status-" + id);
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "form-status is-visible " + kind;
  }
  function run(promise) {
    return promise
      .then(function () { return refreshDetail(id); })
      .then(function () { return loadPendingVideos(); }) // keeps the queue count/list honest after any action, not just video ones
      .then(function () { showStatus("success", "Saved."); })
      .catch(function (err) { showStatus("error", err.message); });
  }

  var setTierBtn = detailRow.querySelector('[data-set-tier="' + id + '"]');
  if (setTierBtn) {
    setTierBtn.addEventListener("click", function () {
      var newTier = detailRow.querySelector("#tier-input-" + id).value;
      var notes = detailRow.querySelector("#tier-notes-" + id).value;
      run(apiFetch("/api/talent/" + id + "/verify", { method: "POST", body: { new_tier: newTier, notes: notes || undefined } }));
    });
  }

  var visibilityCheckbox = detailRow.querySelector("#public-visible-" + id);
  if (visibilityCheckbox) {
    visibilityCheckbox.addEventListener("change", function () {
      run(apiFetch("/api/talent/" + id, { method: "PATCH", body: { public_visible: visibilityCheckbox.checked } }));
    });
  }

  detailRow.querySelectorAll("[data-view-evidence]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var path = btn.getAttribute("data-evidence-path");
      var { data, error } = await supabase.storage.from("talent-evidence").createSignedUrl(path, 300);
      if (error) {
        showStatus("error", "Could not open the document: " + error.message);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener");
    });
  });

  var viewVideoBtn = detailRow.querySelector('[data-view-video="' + id + '"]');
  if (viewVideoBtn) {
    viewVideoBtn.addEventListener("click", async function () {
      var path = viewVideoBtn.getAttribute("data-video-path");
      var { data, error } = await supabase.storage.from("talent-videos").createSignedUrl(path, 300);
      if (error) {
        showStatus("error", "Could not open the video: " + error.message);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener");
    });
  }

  var approveVideoBtn = detailRow.querySelector('[data-video-approve="' + id + '"]');
  if (approveVideoBtn) {
    approveVideoBtn.addEventListener("click", function () {
      run(apiFetch("/api/talent/" + id + "/introduction-video/review", { method: "POST", body: { status: "approved" } }));
    });
  }
  var rejectVideoBtn = detailRow.querySelector('[data-video-reject="' + id + '"]');
  if (rejectVideoBtn) {
    rejectVideoBtn.addEventListener("click", function () {
      var reason = detailRow.querySelector("#video-reject-reason-" + id).value.trim();
      if (!reason) {
        showStatus("error", "Enter a reason before rejecting.");
        return;
      }
      run(apiFetch("/api/talent/" + id + "/introduction-video/review", { method: "POST", body: { status: "rejected", rejection_reason: reason } }));
    });
  }

  detailRow.querySelectorAll("[data-evidence-approve]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var evidenceId = btn.getAttribute("data-evidence-approve");
      run(apiFetch("/api/talent/" + id + "/evidence/" + evidenceId + "/review", { method: "POST", body: { status: "approved" } }));
    });
  });
  detailRow.querySelectorAll("[data-evidence-reject]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var evidenceId = btn.getAttribute("data-evidence-reject");
      run(apiFetch("/api/talent/" + id + "/evidence/" + evidenceId + "/review", { method: "POST", body: { status: "rejected" } }));
    });
  });
}
