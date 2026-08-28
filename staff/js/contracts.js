import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

var DISPUTE_STATUSES = ["open", "investigating", "resolved", "escalated"];
var FINANCE_STATUSES = ["pending", "confirmed", "reconciled", "cancelled"];

var rows = [];
var activeFilter = "";

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
  var tbody = document.getElementById("contracts-body");
  tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Loading…</td></tr>';
  try {
    var qs = activeFilter ? "?status=" + activeFilter + "&limit=100" : "?limit=100";
    var res = await apiFetch("/api/contracts" + qs);
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("contracts-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">No contracts match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.opportunities?.title || "—") + "</td>" +
        "<td>" + escapeHtml(row.talent_profiles?.display_name || row.talent_profiles?.headline || "—") + "</td>" +
        "<td>" + escapeHtml(row.organisations?.name || "—") + "</td>" +
        "<td>" + statusBadge(row.status) + "</td>" +
        "<td>" + formatDate(row.started_at) + "</td>" +
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

async function refreshDetail(id, detailRow) {
  detailRow.querySelector("td").innerHTML = "Loading…";
  try {
    var res = await apiFetch("/api/contracts/" + id);
    detailRow.querySelector("td").innerHTML = renderDetail(res.data);
    wireDetailActions(id, detailRow);
  } catch (err) {
    detailRow.querySelector("td").innerHTML = escapeHtml(err.message);
  }
}

function wireDetailActions(id, detailRow) {
  detailRow.querySelectorAll("[data-resolve-dispute]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var disputeId = btn.getAttribute("data-resolve-dispute");
      var status = detailRow.querySelector("#dispute-status-" + disputeId).value;
      var resolution = detailRow.querySelector("#dispute-resolution-" + disputeId).value;
      btn.disabled = true;
      try {
        await apiFetch("/api/disputes/" + disputeId, {
          method: "PATCH",
          body: { status: status, resolution: resolution || undefined },
        });
        await refreshDetail(id, detailRow);
        await load();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });

  detailRow.querySelectorAll("[data-refund-dispute]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var disputeId = btn.getAttribute("data-refund-dispute");
      var milestoneId = detailRow.querySelector("#dispute-refund-milestone-" + disputeId).value;
      var notes = detailRow.querySelector("#dispute-refund-notes-" + disputeId).value;
      if (!milestoneId) {
        alert("Choose which milestone's payment to refund.");
        return;
      }
      if (!confirm("Mark this milestone's settled payment as refunded and record a finance entry? This cannot be undone here.")) {
        return;
      }
      btn.disabled = true;
      try {
        await apiFetch("/api/disputes/" + disputeId + "/refund", {
          method: "POST",
          body: { milestone_id: milestoneId, notes: notes || undefined },
        });
        await refreshDetail(id, detailRow);
        await load();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });

  detailRow.querySelectorAll("[data-reconcile-invoice]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var invoiceId = btn.getAttribute("data-reconcile-invoice");
      var status = detailRow.querySelector("#invoice-status-" + invoiceId).value;
      btn.disabled = true;
      try {
        await apiFetch("/api/finance/" + invoiceId, { method: "PATCH", body: { status: status } });
        await refreshDetail(id, detailRow);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });
}

function renderDetail(c) {
  var milestones = (c.milestones || []).slice().sort(function (a, b) { return a.sequence - b.sequence; });
  var payments = c.payment_events || [];
  var reviews = c.reviews || [];

  var milestonesHtml = milestones.length
    ? milestones
        .map(function (m) {
          var deliverables = (m.deliverables || [])
            .slice()
            .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
          var deliverablesHtml = deliverables.length
            ? deliverables
                .map(function (d) {
                  return (
                    "<li>" + statusBadge(d.status) + " " + escapeHtml(d.note || "(no note)") +
                    (d.file_path ? " · file attached" : "") +
                    ' <time>' + formatDate(d.created_at) + "</time></li>"
                  );
                })
                .join("")
            : "<li>No submissions yet.</li>";
          return (
            "<li><strong>" + escapeHtml(m.title) + "</strong> — " + escapeHtml(m.currency) + " " +
            escapeHtml(Number(m.amount).toLocaleString()) + " " + statusBadge(m.status) +
            '<ul class="staff-events" style="margin-top:0.4em;padding-left:1em;">' + deliverablesHtml + "</ul>" +
            "</li>"
          );
        })
        .join("")
    : "<li>No milestones.</li>";

  var paymentsHtml = payments.length
    ? payments
        .map(function (p) {
          return (
            "<li>" + escapeHtml(p.currency) + " " + escapeHtml(Number(p.amount).toLocaleString()) +
            " · " + statusBadge(p.status) + (p.is_simulated ? " (simulated)" : "") +
            ' <time>' + formatDate(p.created_at) + "</time></li>"
          );
        })
        .join("")
    : "<li>No payment events yet.</li>";

  var invoices = (c.finance_records || []).filter(function (f) { return f.record_type === "invoice"; })
    .slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  var invoicesHtml = invoices.length
    ? invoices
        .map(function (inv) {
          var fOptions = FINANCE_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === inv.status ? " selected" : "") + ">" + s + "</option>"; }).join("");
          return (
            "<li>" + escapeHtml(inv.currency) + " " + escapeHtml(Number(inv.amount).toLocaleString()) +
            " " + statusBadge(inv.status) + ' <time>' + formatDate(inv.created_at) + "</time>" +
            '<div class="form-grid form-grid-2 mt-1">' +
            '<select id="invoice-status-' + inv.id + '">' + fOptions + "</select>" +
            '<button type="button" class="btn btn-secondary" data-reconcile-invoice="' + inv.id + '">Save</button>' +
            "</div></li>"
          );
        })
        .join("")
    : "<li>No invoices yet.</li>";

  var intentions = (c.payment_intentions || []).slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  var intentionsHtml = intentions.length
    ? intentions
        .map(function (pi) {
          var payerLabel = pi.card_last4 ? escapeHtml(pi.card_brand || "Card") + " ····" + escapeHtml(pi.card_last4) : escapeHtml(pi.payer_phone || "—");
          return (
            "<li>" + escapeHtml(pi.provider) + " · " + payerLabel + " · " +
            escapeHtml(pi.currency) + " " + escapeHtml(Number(pi.amount).toLocaleString()) + " " +
            statusBadge(pi.status) + (pi.failure_reason ? " — " + escapeHtml(pi.failure_reason) : "") +
            ' <time>' + formatDate(pi.created_at) + "</time></li>"
          );
        })
        .join("")
    : "<li>No payment attempts yet.</li>";

  var reviewsHtml = reviews.length
    ? reviews
        .map(function (r) {
          return (
            "<li><strong>" + escapeHtml(r.reviewer_role) + "</strong> — " + "★".repeat(r.rating) +
            (r.feedback ? " — " + escapeHtml(r.feedback) : "") + "</li>"
          );
        })
        .join("")
    : "<li>No reviews yet.</li>";

  var timesheets = (c.timesheets || []).slice().sort(function (a, b) { return new Date(b.period_start) - new Date(a.period_start); });
  var timesheetsHtml = timesheets.length
    ? timesheets
        .map(function (t) {
          return (
            "<li>" + formatDate(t.period_start) + " – " + formatDate(t.period_end) + " · " +
            escapeHtml(String(t.hours)) + "h " + statusBadge(t.status) + "</li>"
          );
        })
        .join("")
    : "<li>No timesheets logged.</li>";

  var milestoneOptions = milestones.length
    ? milestones
        .map(function (m) { return '<option value="' + m.id + '">' + escapeHtml(m.title) + " — " + escapeHtml(m.currency) + " " + escapeHtml(Number(m.amount).toLocaleString()) + " (" + m.status + ")</option>"; })
        .join("")
    : "";

  var disputes = (c.disputes || []).slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  var disputesHtml = disputes.length
    ? disputes
        .map(function (disp) {
          var dOptions = DISPUTE_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === disp.status ? " selected" : "") + ">" + s + "</option>"; }).join("");
          var refundBlock = milestones.length
            ? '<div class="form-grid form-grid-2 mt-1">' +
              '<select id="dispute-refund-milestone-' + disp.id + '"><option value="">Refund which milestone?</option>' + milestoneOptions + "</select>" +
              '<input type="text" id="dispute-refund-notes-' + disp.id + '" placeholder="Refund notes (optional)">' +
              "</div>" +
              '<div class="action-row"><button type="button" class="btn btn-secondary" data-refund-dispute="' + disp.id + '">Refund settled payment</button></div>'
            : "";
          return (
            "<li>" + escapeHtml(disp.description) + " — " + statusBadge(disp.status) +
            '<div class="form-grid form-grid-2 mt-1">' +
            '<select id="dispute-status-' + disp.id + '">' + dOptions + "</select>" +
            '<input type="text" id="dispute-resolution-' + disp.id + '" placeholder="Resolution notes" value="' + escapeHtml(disp.resolution || "") + '">' +
            "</div>" +
            '<div class="action-row"><button type="button" class="btn btn-secondary" data-resolve-dispute="' + disp.id + '">Save</button></div>' +
            refundBlock +
            "</li>"
          );
        })
        .join("")
    : "<li>No disputes.</li>";

  return (
    '<div class="detail-grid detail-grid-2">' +
    "<div>" +
    "<h3>Milestones</h3>" +
    '<ul class="staff-events">' + milestonesHtml + "</ul>" +
    "<h3 class=\"mt-1\">Payments <span style=\"font-weight:400;font-size:0.8em;\">(simulated — no real payment provider)</span></h3>" +
    '<ul class="staff-events">' + paymentsHtml + "</ul>" +
    "<h3 class=\"mt-1\">Timesheets</h3>" +
    '<ul class="staff-events">' + timesheetsHtml + "</ul>" +
    "</div>" +
    "<div>" +
    "<h3>Invoices <span style=\"font-weight:400;font-size:0.8em;\">(reconcile once confirmed externally)</span></h3>" +
    '<ul class="staff-events">' + invoicesHtml + "</ul>" +
    "<h3 class=\"mt-1\">Payment attempts</h3>" +
    '<ul class="staff-events">' + intentionsHtml + "</ul>" +
    "<h3 class=\"mt-1\">Reviews</h3>" +
    '<ul class="staff-events">' + reviewsHtml + "</ul>" +
    "<h3 class=\"mt-1\">Disputes</h3>" +
    '<ul class="staff-events">' + disputesHtml + "</ul>" +
    "<h3 class=\"mt-1\">Details</h3>" +
    '<dl class="kv-list">' +
    "<dt>Started</dt><dd>" + formatDate(c.started_at) + "</dd>" +
    "<dt>Completed</dt><dd>" + formatDate(c.completed_at) + "</dd>" +
    (c.cancelled_at
      ? "<dt>Cancelled</dt><dd>" + formatDate(c.cancelled_at) + "</dd>" +
        "<dt>Cancellation reason</dt><dd>" + escapeHtml(c.cancellation_reason || "—") + "</dd>"
      : "") +
    "</dl>" +
    "</div>" +
    "</div>"
  );
}
