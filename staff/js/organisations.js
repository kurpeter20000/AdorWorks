import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge, supabase } from "./app.js";

initLogout();

var rows = [];
var activeFilter = "pending";

var CHECK_STATUSES = ["not_started", "information_required", "submitted", "under_review", "verified", "rejected", "suspended", "expired"];
var CHECK_METHODS = ["formal_registration", "alternative_referral", "physical_review", "representative_attestation"];

var auth = await requireStaffSession();
if (auth) {
  wireFilters();
  await load();
}

function wireFilters() {
  document.querySelectorAll("[data-status-filter]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll("[data-status-filter]").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      chip.setAttribute("aria-pressed", "true");
      activeFilter = chip.getAttribute("data-status-filter");
      load();
    });
  });
}

async function load() {
  var tbody = document.getElementById("orgs-body");
  tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Loading…</td></tr>';
  try {
    var qs = activeFilter ? "?verification_status=" + activeFilter + "&limit=100" : "?limit=100";
    var res = await apiFetch("/api/organisations" + qs);
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("orgs-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">No organisations match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      var rep = row.profiles ? row.profiles.full_name + (row.profiles.phone ? " · " + row.profiles.phone : "") : "—";
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.name) + "</td>" +
        "<td>" + escapeHtml(row.sector || "—") + "</td>" +
        "<td>" + escapeHtml(rep) + "</td>" +
        "<td>" + statusBadge(row.verification_status) + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        "</tr>" +
        '<tr class="detail-row" id="detail-' + row.id + '"><td colspan="5"></td></tr>'
      );
    })
    .join("");

  tbody.querySelectorAll("tr[data-row-id]").forEach(function (tr) {
    tr.addEventListener("click", function () { toggleDetail(tr.getAttribute("data-row-id")); });
  });
}

function toggleDetail(id) {
  var detailRow = document.getElementById("detail-" + id);
  var isOpen = detailRow.classList.contains("is-open");
  document.querySelectorAll("tr.detail-row.is-open").forEach(function (r) { r.classList.remove("is-open"); });
  if (isOpen) return;
  detailRow.classList.add("is-open");
  renderDetail(id, detailRow);
}

function renderDetail(id, detailRow) {
  var row = rows.find(function (r) { return r.id === id; });
  var statuses = ["pending", "verified", "rejected", "suspended"];
  var options = statuses
    .map(function (s) { return '<option value="' + s + '"' + (s === row.verification_status ? " selected" : "") + ">" + s + "</option>"; })
    .join("");
  var rep = row.profiles;

  detailRow.querySelector("td").innerHTML =
    '<dl class="kv-list">' +
    "<dt>Representative</dt><dd>" + escapeHtml((rep && rep.full_name) || "—") +
      (rep && rep.phone ? " · " + escapeHtml(rep.phone) : "") +
      ' · <span id="rep-email-' + id + '">Loading…</span>' + "</dd>" +
    "<dt>Website</dt><dd>" + (row.website ? '<a href="' + escapeHtml(row.website) + '" target="_blank" rel="noopener">' + escapeHtml(row.website) + "</a>" : "—") + "</dd>" +
    "<dt>Billing email</dt><dd>" + escapeHtml(row.billing_email || "—") + "</dd>" +
    "<dt>Registration evidence</dt><dd>" +
      (row.registration_evidence_path
        ? '<button type="button" class="btn btn-secondary" data-view-evidence="' + id + '">View document</button>'
        : "Not uploaded") +
    "</dd>" +
    "<dt>Risk notes</dt><dd>" + escapeHtml(row.risk_notes || "—") + "</dd>" +
    "</dl>" +
    '<div class="staff-section" id="verification-checks-' + id + '"><h3>Verification</h3><p class="muted">Loading…</p></div>' +
    '<div class="staff-section" id="risk-flags-' + id + '"><h3>Risk flags</h3><p class="muted">Loading…</p></div>' +
    '<div class="staff-section" id="engagement-' + id + '"><h3>Engagement</h3><p class="muted">Loading…</p></div>' +
    '<div class="staff-section">' +
    "<h3>Overall status override</h3>" +
    '<p class="muted">Normally set automatically from the two checks above — use this only to force an outcome (e.g. verification done off-platform). Explaining why is required every time, since this bypasses the normal evidence check.</p>' +
    '<div class="form-grid form-grid-2 mt-1">' +
    '<select id="status-input-' + id + '">' + options + "</select>" +
    '<input type="text" id="notes-input-' + id + '" placeholder="Why? (required, at least 10 characters)" value="' + escapeHtml(row.risk_notes || "") + '">' +
    "</div>" +
    '<div class="action-row"><button type="button" class="btn btn-secondary" data-save="' + id + '">Save override</button></div>' +
    "</div>" +
    '<div class="form-status" id="detail-status-' + id + '" role="status"></div>';

  var viewEvidenceBtn = detailRow.querySelector('[data-view-evidence="' + id + '"]');
  if (viewEvidenceBtn) {
    viewEvidenceBtn.addEventListener("click", async function () {
      var statusEl = detailRow.querySelector("#detail-status-" + id);
      var { data, error } = await supabase.storage
        .from("org-documents")
        .createSignedUrl(row.registration_evidence_path, 300);
      if (error) {
        statusEl.textContent = "Could not open the document: " + error.message;
        statusEl.className = "form-status is-visible error";
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener");
    });
  }

  detailRow.querySelector('[data-save="' + id + '"]').addEventListener("click", async function () {
    var statusEl = detailRow.querySelector("#detail-status-" + id);
    var newStatus = detailRow.querySelector("#status-input-" + id).value;
    var notes = detailRow.querySelector("#notes-input-" + id).value.trim();
    if (notes.length < 10) {
      statusEl.textContent = "Explain why (at least 10 characters) — this bypasses the normal evidence check.";
      statusEl.className = "form-status is-visible error";
      return;
    }
    try {
      await apiFetch("/api/organisations/" + id + "/verify", {
        method: "PATCH",
        body: { verification_status: newStatus, risk_notes: notes },
      });
      statusEl.textContent = "Saved.";
      statusEl.className = "form-status is-visible success";
      await load();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "form-status is-visible error";
    }
  });

  loadRepresentativeEmail(id, detailRow);
  loadEngagement(id, detailRow);
  loadRiskFlags(id, detailRow);
}

var RISK_INDICATOR_LABEL = {
  fraud: "Fraud",
  scam: "Scam",
  fake_identity: "Fake identity",
  payment_risk: "Payment risk",
  other: "Other",
};

// S10-11: proactive fraud/scam indicators — separate from the reactive,
// user-submitted reports queue (staff/reports.html).
async function loadRiskFlags(id, detailRow) {
  var el = detailRow.querySelector("#risk-flags-" + id);
  if (!el) return;
  try {
    var res = await apiFetch("/api/risk-flags?target_type=organisation&target_id=" + id + "&limit=20");
    var flags = res.data;
    var openFlags = flags.filter(function (f) { return !f.resolved; });
    var html = "<h3>Risk flags" + (openFlags.length ? " (" + openFlags.length + " open)" : "") + "</h3>";
    if (!flags.length) {
      html += '<p class="muted">No flags on this organisation.</p>';
    } else {
      html += '<ul class="kv-list">' + flags.map(function (f) {
        return (
          "<li>" +
          (f.resolved ? '<span class="status-badge status-neutral">resolved</span>' : '<span class="status-badge status-danger">open</span>') +
          " " + escapeHtml(RISK_INDICATOR_LABEL[f.indicator] || f.indicator) + " — " + escapeHtml(f.note) +
          " <em>(" + escapeHtml((f.flagger && f.flagger.full_name) || "staff") + ", " + formatDate(f.created_at) + ")</em>" +
          (f.resolved ? "" : ' <button type="button" class="btn btn-secondary" data-resolve-flag="' + f.id + '">Resolve</button>') +
          "</li>"
        );
      }).join("") + "</ul>";
    }
    html += '<div class="action-row mt-1"><button type="button" class="btn btn-danger" data-add-flag="' + id + '">Flag as suspicious</button></div>';
    el.innerHTML = html;

    var addBtn = el.querySelector('[data-add-flag="' + id + '"]');
    if (addBtn) {
      addBtn.addEventListener("click", async function () {
        var indicator = prompt("Indicator (fraud, scam, fake_identity, payment_risk, other):", "fraud");
        if (!indicator) return;
        var note = prompt("What's suspicious, and why?");
        if (!note) return;
        try {
          await apiFetch("/api/risk-flags", { method: "POST", body: { target_type: "organisation", target_id: id, indicator: indicator, note: note } });
          await loadRiskFlags(id, detailRow);
        } catch (err) {
          alert(err.message);
        }
      });
    }
    el.querySelectorAll("[data-resolve-flag]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var notes = prompt("What did you find, and what did you do?");
        if (!notes) return;
        try {
          await apiFetch("/api/risk-flags/" + btn.getAttribute("data-resolve-flag") + "/resolve", { method: "POST", body: { resolution_notes: notes } });
          await loadRiskFlags(id, detailRow);
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    el.innerHTML = "<h3>Risk flags</h3><p class=\"muted\">" + escapeHtml(err.message) + "</p>";
  }
}

async function loadRepresentativeEmail(id, detailRow) {
  var emailEl = detailRow.querySelector("#rep-email-" + id);
  var checksEl = detailRow.querySelector("#verification-checks-" + id);
  try {
    var res = await apiFetch("/api/organisations/" + id);
    if (emailEl) emailEl.textContent = (res.data.profiles && res.data.profiles.email) || "no email on file";
    if (checksEl) renderVerificationChecks(id, detailRow, res.data.verification_checks || []);
  } catch (err) {
    if (emailEl) emailEl.textContent = "—";
    if (checksEl) checksEl.innerHTML = "<h3>Verification</h3><p class=\"muted\">" + escapeHtml(err.message) + "</p>";
  }
}

function renderVerificationChecks(id, detailRow, checks) {
  var el = detailRow.querySelector("#verification-checks-" + id);
  var byType = {};
  checks.forEach(function (c) { byType[c.check_type] = c; });

  function checkBlock(type, label, hint) {
    var check = byType[type] || { status: "not_started", method: null, reason: null, applicant_note: null };
    var statusOptions = CHECK_STATUSES.map(function (s) {
      return '<option value="' + s + '"' + (s === check.status ? " selected" : "") + ">" + s.replace(/_/g, " ") + "</option>";
    }).join("");
    var methodOptions = '<option value="">— how verified —</option>' + CHECK_METHODS.map(function (m) {
      return '<option value="' + m + '"' + (m === check.method ? " selected" : "") + ">" + m.replace(/_/g, " ") + "</option>";
    }).join("");
    return (
      "<div class=\"kv-list\" style=\"margin-top:0.75em;\">" +
      "<p class=\"mb-0\"><strong>" + label + "</strong> — " + statusBadge(check.status) + "</p>" +
      "<p class=\"muted mt-0\">" + hint + "</p>" +
      (check.applicant_note ? "<p class=\"mt-0\"><em>Org's note:</em> " + escapeHtml(check.applicant_note) + "</p>" : "") +
      '<div class="form-grid form-grid-2 mt-1">' +
      '<select id="check-status-' + type + "-" + id + '">' + statusOptions + "</select>" +
      '<select id="check-method-' + type + "-" + id + '">' + methodOptions + "</select>" +
      "</div>" +
      '<input type="text" id="check-reason-' + type + "-" + id + '" placeholder="Reason (shown to the org)" value="' + escapeHtml(check.reason || "") + '" class="mt-1">' +
      '<div class="action-row"><button type="button" class="btn btn-primary" data-save-check="' + type + '">Save ' + label.toLowerCase() + '</button></div>' +
      "</div>"
    );
  }

  el.innerHTML =
    "<h3>Verification</h3>" +
    checkBlock("registration", "Registration", "Business registration documents, or an alternative verification method for SMEs/NGOs without formal registration.") +
    checkBlock("representative", "Representative", "Confirms the signed-up person actually represents this organisation.");

  ["registration", "representative"].forEach(function (type) {
    var btn = el.querySelector('[data-save-check="' + type + '"]');
    btn.addEventListener("click", async function () {
      var statusEl = detailRow.querySelector("#detail-status-" + id);
      var status = document.getElementById("check-status-" + type + "-" + id).value;
      var method = document.getElementById("check-method-" + type + "-" + id).value;
      var reason = document.getElementById("check-reason-" + type + "-" + id).value;
      try {
        await apiFetch("/api/organisations/" + id + "/verification-checks/" + type, {
          method: "PATCH",
          body: { status: status, method: method || undefined, reason: reason || undefined },
        });
        statusEl.textContent = "Saved. Reopen this row to see the updated status.";
        statusEl.className = "form-status is-visible success";
        await load();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = "form-status is-visible error";
      }
    });
  });
}

async function loadEngagement(id, detailRow) {
  var el = detailRow.querySelector("#engagement-" + id);
  if (!el) return;
  try {
    var res = await apiFetch("/api/organisations/" + id + "/engagement");
    var e = res.data;
    var oppLine = e.opportunities.total + " posted" + statusBreakdown(e.opportunities.by_status);
    var offerLine = e.offers.total + " sent" + statusBreakdown(e.offers.by_status);
    var contractLine = e.contracts.total + " total" + statusBreakdown(e.contracts.by_status);
    el.innerHTML =
      "<h3>Engagement</h3>" +
      '<dl class="kv-list">' +
      "<dt>Opportunities</dt><dd>" + oppLine + "</dd>" +
      "<dt>Applications received</dt><dd>" + e.applications_total + "</dd>" +
      "<dt>Offers</dt><dd>" + offerLine + "</dd>" +
      "<dt>Contracts</dt><dd>" + contractLine + "</dd>" +
      "<dt>Last activity</dt><dd>" + formatDate(e.last_activity_at) + "</dd>" +
      "</dl>";
  } catch (err) {
    el.innerHTML = "<h3>Engagement</h3><p class=\"muted\">" + escapeHtml(err.message) + "</p>";
  }
}

function statusBreakdown(byStatus) {
  var parts = Object.keys(byStatus).map(function (k) { return k.replace(/_/g, " ") + ": " + byStatus[k]; });
  return parts.length ? " (" + parts.join(", ") + ")" : "";
}
