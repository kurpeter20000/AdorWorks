import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

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
  detailRow.querySelector("td").innerHTML = "Loading…";
  try {
    var res = await apiFetch("/api/contracts/" + id);
    detailRow.querySelector("td").innerHTML = renderDetail(res.data);
  } catch (err) {
    detailRow.querySelector("td").innerHTML = escapeHtml(err.message);
  }
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

  return (
    '<div class="detail-grid detail-grid-2">' +
    "<div>" +
    "<h3>Milestones</h3>" +
    '<ul class="staff-events">' + milestonesHtml + "</ul>" +
    "<h3 class=\"mt-1\">Payments <span style=\"font-weight:400;font-size:0.8em;\">(simulated — no real payment provider)</span></h3>" +
    '<ul class="staff-events">' + paymentsHtml + "</ul>" +
    "</div>" +
    "<div>" +
    "<h3>Reviews</h3>" +
    '<ul class="staff-events">' + reviewsHtml + "</ul>" +
    "<h3 class=\"mt-1\">Details</h3>" +
    '<dl class="kv-list">' +
    "<dt>Started</dt><dd>" + formatDate(c.started_at) + "</dd>" +
    "<dt>Completed</dt><dd>" + formatDate(c.completed_at) + "</dd>" +
    "</dl>" +
    "</div>" +
    "</div>"
  );
}
