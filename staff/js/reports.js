import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate } from "./app.js";

initLogout();

// Local, not the shared statusBadge()/STATUS_TONE map — "open" there means
// "live and good" (an opportunity), but here it means "unresolved, needs
// attention", so it needs its own tone, not the shared one.
var REPORT_STATUS_TONE = { open: "warning", reviewed: "info", dismissed: "neutral", actioned: "success" };
function reportStatusBadge(value) {
  var tone = REPORT_STATUS_TONE[value] || "neutral";
  return '<span class="status-badge status-' + tone + '">' + escapeHtml(value) + "</span>";
}

var rows = [];
var activeFilter = "open";

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
  var tbody = document.getElementById("reports-body");
  tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Loading…</td></tr>';
  try {
    var qs = activeFilter ? "?status=" + activeFilter + "&limit=100" : "?limit=100";
    var res = await apiFetch("/api/reports" + qs);
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("reports-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">No reports match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.target_type.replace(/_/g, " ")) + " — " + escapeHtml(row.target_id) + "</td>" +
        "<td>" + escapeHtml(row.reason.replace(/_/g, " ")) + "</td>" +
        "<td>" + escapeHtml(row.profiles?.full_name || "—") + "</td>" +
        "<td>" + reportStatusBadge(row.status) + "</td>" +
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
  var row = rows.find(function (r) { return r.id === id; });
  detailRow.querySelector("td").innerHTML = renderDetailShell(row);
  wireDetailActions(id, detailRow);
}

function renderDetailShell(row) {
  return (
    '<dl class="kv-list">' +
    "<dt>Target type</dt><dd>" + escapeHtml(row.target_type.replace(/_/g, " ")) + "</dd>" +
    "<dt>Target ID</dt><dd>" + escapeHtml(row.target_id) + "</dd>" +
    "<dt>Note</dt><dd>" + escapeHtml(row.note || "—") + "</dd>" +
    "</dl>" +
    (row.status === "open"
      ? '<div class="action-row">' +
        '<button type="button" class="btn btn-secondary" data-report-status="' + row.id + '" data-status="reviewed">Mark reviewed</button>' +
        '<button type="button" class="btn btn-secondary" data-report-status="' + row.id + '" data-status="dismissed">Dismiss</button>' +
        '<button type="button" class="btn btn-primary" data-report-status="' + row.id + '" data-status="actioned">Mark actioned</button>' +
        "</div>"
      : "") +
    '<div class="form-status" id="detail-status-' + row.id + '" role="status"></div>'
  );
}

function wireDetailActions(id, detailRow) {
  function showStatus(kind, message) {
    var el = detailRow.querySelector("#detail-status-" + id);
    if (el) { el.textContent = message; el.className = "form-status is-visible " + kind; }
  }

  detailRow.querySelectorAll('[data-report-status="' + id + '"]').forEach(function (btn) {
    btn.addEventListener("click", async function () {
      try {
        await apiFetch("/api/reports/" + id, { method: "PATCH", body: { status: btn.getAttribute("data-status") } });
        showStatus("success", "Updated.");
        await load();
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  });
}
