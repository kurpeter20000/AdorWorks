import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

var rows = [];
var activeFilter = "";
var isFinanceStaff = false;

var auth = await requireStaffSession();
if (auth) {
  isFinanceStaff = auth.profile.role === "finance" || auth.profile.role === "admin";
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
  var tbody = document.getElementById("engagements-body");
  tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Loading…</td></tr>';
  try {
    var qs = activeFilter ? "?status=" + activeFilter + "&limit=100" : "?limit=100";
    var res = await apiFetch("/api/engagements" + qs);
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("engagements-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">No engagements match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.organisations?.name || "—") + "</td>" +
        "<td>" + escapeHtml(row.talent_profiles?.headline || "—") + "</td>" +
        "<td>" + escapeHtml(row.contract_type || "—") + "</td>" +
        "<td>" + statusBadge(row.status) + "</td>" +
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

async function toggleDetail(id) {
  var detailRow = document.getElementById("detail-" + id);
  var isOpen = detailRow.classList.contains("is-open");
  document.querySelectorAll("tr.detail-row.is-open").forEach(function (r) { r.classList.remove("is-open"); });
  if (isOpen) return;
  detailRow.classList.add("is-open");
  await refreshDetail(id, detailRow);
}

var ENGAGEMENT_STATUSES = ["proposed", "contracted", "active", "completed", "cancelled", "disputed"];
var DISPUTE_STATUSES = ["open", "investigating", "resolved", "escalated"];

async function refreshDetail(id, detailRow) {
  detailRow.querySelector("td").innerHTML = "Loading…";
  try {
    var res = await apiFetch("/api/engagements/" + id);
    detailRow.querySelector("td").innerHTML = renderDetail(res.data);
    wireDetailActions(id, res.data, detailRow);
  } catch (err) {
    detailRow.querySelector("td").innerHTML = '<p class="mb-0">' + escapeHtml(err.message) + "</p>";
  }
}

function renderDetail(d) {
  var e = d.engagement;
  var statusOptions = ENGAGEMENT_STATUSES
    .map(function (s) { return '<option value="' + s + '"' + (s === e.status ? " selected" : "") + ">" + s + "</option>"; })
    .join("");

  var milestones = (e.milestones || [])
    .map(function (m) { return "<li>" + (m.done ? "✅ " : "⬜ ") + escapeHtml(m.title || JSON.stringify(m)) + "</li>"; })
    .join("") || "<li>No milestones yet.</li>";

  var events = d.events.length
    ? d.events.map(function (ev) {
        return "<li><time>" + formatDate(ev.created_at) + "</time>" + escapeHtml(ev.event_type.replace(/_/g, " ")) +
          (ev.new_value ? ": " + escapeHtml(ev.new_value) : "") + "</li>";
      }).join("")
    : "<li>No events yet.</li>";

  var reviews = d.reviews.length
    ? d.reviews.map(function (r) { return "<li>" + escapeHtml(r.reviewer_role) + " rated " + r.rating + "/5" + (r.feedback ? " — " + escapeHtml(r.feedback) : "") + "</li>"; }).join("")
    : "<li>No reviews yet.</li>";

  var financeRows = d.finance_records.length
    ? d.finance_records.map(function (f) {
        return "<li>" + escapeHtml(f.record_type) + " " + escapeHtml(f.amount) + " " + escapeHtml(f.currency) + " — " + statusBadge(f.status) + (f.notes ? " — " + escapeHtml(f.notes) : "") + "</li>";
      }).join("")
    : "<li>No finance records yet.</li>";

  var financeForm = isFinanceStaff
    ? '<div class="form-grid form-grid-2 mt-1">' +
      '<select id="finance-type-' + e.id + '"><option value="deposit">Deposit</option><option value="invoice">Invoice</option><option value="fee">Fee</option><option value="payout">Payout</option><option value="refund">Refund</option></select>' +
      '<input type="number" id="finance-amount-' + e.id + '" placeholder="Amount" min="0" step="0.01">' +
      '<input type="text" id="finance-currency-' + e.id + '" placeholder="Currency" value="SSP">' +
      '<input type="text" id="finance-notes-' + e.id + '" placeholder="Notes (optional)">' +
      "</div>" +
      '<div class="action-row"><button type="button" class="btn btn-secondary" data-add-finance="' + e.id + '">Record entry (manual tracking only)</button></div>'
    : '<p class="text-sm muted">Only finance/admin staff can record entries.</p>';

  var disputes = d.disputes.length
    ? d.disputes.map(function (disp) {
        var dOptions = DISPUTE_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === disp.status ? " selected" : "") + ">" + s + "</option>"; }).join("");
        return (
          "<li>" + escapeHtml(disp.description) + " — " + statusBadge(disp.status) +
          '<div class="form-grid form-grid-2 mt-1">' +
          '<select id="dispute-status-' + disp.id + '">' + dOptions + "</select>" +
          '<input type="text" id="dispute-resolution-' + disp.id + '" placeholder="Resolution notes" value="' + escapeHtml(disp.resolution || "") + '">' +
          "</div>" +
          '<div class="action-row"><button type="button" class="btn btn-secondary" data-resolve-dispute="' + disp.id + '">Save</button></div></li>'
        );
      }).join("")
    : "<li>No disputes on this engagement.</li>";

  return (
    '<div class="detail-grid detail-grid-2">' +
    "<div>" +
    '<dl class="kv-list">' +
    "<dt>Opportunity</dt><dd>" + escapeHtml(e.opportunities?.title || "—") + "</dd>" +
    "<dt>Scope</dt><dd>" + escapeHtml(e.scope || "—") + "</dd>" +
    "<dt>Contract type</dt><dd>" + escapeHtml(e.contract_type || "—") + "</dd>" +
    "<dt>Started / completed</dt><dd>" + formatDate(e.started_at) + " · " + formatDate(e.completed_at) + "</dd>" +
    "</dl>" +
    '<div class="form-grid form-grid-2 mt-1">' +
    '<select id="status-input-' + e.id + '">' + statusOptions + "</select>" +
    '<button type="button" class="btn btn-primary" data-save-status="' + e.id + '">Update status</button>' +
    "</div>" +
    "<h4 class=\"mt-1\">Milestones</h4><ul class=\"staff-events\">" + milestones + "</ul>" +
    '<div class="form-grid form-grid-2">' +
    '<input type="text" id="milestone-input-' + e.id + '" placeholder="New milestone title">' +
    '<button type="button" class="btn btn-secondary" data-add-milestone="' + e.id + '">Add milestone</button>' +
    "</div>" +
    "<h4 class=\"mt-1\">Add a note</h4>" +
    '<div class="form-grid form-grid-2">' +
    '<input type="text" id="note-input-' + e.id + '" placeholder="Call summary, decision, etc.">' +
    '<button type="button" class="btn btn-secondary" data-add-note="' + e.id + '">Add note</button>' +
    "</div>" +
    "<h4 class=\"mt-1\">Audit trail</h4><ul class=\"staff-events\">" + events + "</ul>" +
    '<div class="form-status" id="detail-status-' + e.id + '" role="status"></div>' +
    "</div>" +
    "<div>" +
    "<h4>Finance (manual tracking)</h4><ul class=\"staff-events\">" + financeRows + "</ul>" + financeForm +
    "<h4 class=\"mt-1\">Reviews</h4><ul class=\"staff-events\">" + reviews + "</ul>" +
    "<h4 class=\"mt-1\">Disputes</h4><ul class=\"staff-events\">" + disputes + "</ul>" +
    "</div>" +
    "</div>"
  );
}

function wireDetailActions(id, d, detailRow) {
  function showStatus(kind, message) {
    var el = detailRow.querySelector("#detail-status-" + id);
    if (el) { el.textContent = message; el.className = "form-status is-visible " + kind; }
  }
  function refresh() { return refreshDetail(id, detailRow); }

  detailRow.querySelector('[data-save-status="' + id + '"]').addEventListener("click", async function () {
    var newStatus = detailRow.querySelector("#status-input-" + id).value;
    try {
      await apiFetch("/api/engagements/" + id, { method: "PATCH", body: { status: newStatus } });
      await refresh();
      showStatus("success", "Saved.");
      await load();
    } catch (err) {
      showStatus("error", err.message);
    }
  });

  detailRow.querySelector('[data-add-milestone="' + id + '"]').addEventListener("click", async function () {
    var input = detailRow.querySelector("#milestone-input-" + id);
    var title = input.value.trim();
    if (!title) return;
    var current = d.engagement.milestones || [];
    try {
      await apiFetch("/api/engagements/" + id, {
        method: "PATCH",
        body: { milestones: current.concat([{ title: title, done: false }]) },
      });
      input.value = "";
      await refresh();
    } catch (err) {
      showStatus("error", err.message);
    }
  });

  detailRow.querySelector('[data-add-note="' + id + '"]').addEventListener("click", async function () {
    var input = detailRow.querySelector("#note-input-" + id);
    var note = input.value.trim();
    if (!note) return;
    try {
      await apiFetch("/api/engagements/" + id + "/notes", { method: "POST", body: { note: note } });
      input.value = "";
      await refresh();
    } catch (err) {
      showStatus("error", err.message);
    }
  });

  var financeBtn = detailRow.querySelector('[data-add-finance="' + id + '"]');
  if (financeBtn) {
    financeBtn.addEventListener("click", async function () {
      var amount = detailRow.querySelector("#finance-amount-" + id).value;
      if (!amount) { showStatus("error", "Enter an amount first."); return; }
      try {
        await apiFetch("/api/finance", {
          method: "POST",
          body: {
            engagement_id: id,
            record_type: detailRow.querySelector("#finance-type-" + id).value,
            amount: Number(amount),
            currency: detailRow.querySelector("#finance-currency-" + id).value || "SSP",
            notes: detailRow.querySelector("#finance-notes-" + id).value || undefined,
          },
        });
        await refresh();
        showStatus("success", "Recorded.");
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  }

  detailRow.querySelectorAll("[data-resolve-dispute]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var disputeId = btn.getAttribute("data-resolve-dispute");
      var status = detailRow.querySelector("#dispute-status-" + disputeId).value;
      var resolution = detailRow.querySelector("#dispute-resolution-" + disputeId).value;
      try {
        await apiFetch("/api/disputes/" + disputeId, { method: "PATCH", body: { status: status, resolution: resolution || undefined } });
        await refresh();
        showStatus("success", "Saved.");
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  });
}
