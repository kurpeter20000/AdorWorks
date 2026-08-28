import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

var rows = [];
var activeFilter = "pending_review";

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
  var tbody = document.getElementById("services-body");
  tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">Loading…</td></tr>';
  try {
    var qs = activeFilter ? "?status=" + activeFilter + "&limit=100" : "?limit=100";
    var res = await apiFetch("/api/talent-services" + qs);
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("services-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">No services match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.title) + "</td>" +
        "<td>" + escapeHtml(row.talent_profiles?.headline || row.talent_id) + "</td>" +
        "<td>" + escapeHtml((row.category || "—").replace(/_/g, " ")) + "</td>" +
        "<td>" + (row.price ? escapeHtml(String(row.price)) + " " + escapeHtml(row.currency || "") : "—") + "</td>" +
        "<td>" + statusBadge(row.status) + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        "</tr>" +
        '<tr class="detail-row" id="detail-' + row.id + '"><td colspan="6"></td></tr>'
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
  wireDetailActions(id, row, detailRow);
}

function renderDetailShell(row) {
  return (
    '<dl class="kv-list">' +
    "<dt>Talent</dt><dd>" + escapeHtml(row.talent_profiles?.headline || row.talent_id) + "</dd>" +
    "<dt>Problem solved</dt><dd>" + escapeHtml(row.problem_solved || "—") + "</dd>" +
    "<dt>Deliverables</dt><dd>" + escapeHtml(row.deliverables || "—") + "</dd>" +
    "<dt>Excludes</dt><dd>" + escapeHtml(row.exclusions || "—") + "</dd>" +
    "<dt>Turnaround</dt><dd>" + escapeHtml(row.turnaround || "—") + "</dd>" +
    (row.status === "rejected" || row.status === "paused"
      ? "<dt>" + (row.status === "paused" ? "Pause note" : "Rejection reason") + "</dt><dd>" + escapeHtml(row.status_note || "—") + "</dd>"
      : "") +
    "</dl>" +
    (row.status === "pending_review"
      ? '<div class="action-row">' +
        '<button type="button" class="btn btn-primary" data-publish="' + row.id + '">Publish</button>' +
        "</div>" +
        '<div class="form-grid form-grid-2 mt-1">' +
        '<input type="text" id="reject-reason-' + row.id + '" placeholder="Reason for rejecting (required)">' +
        '<button type="button" class="btn btn-secondary" data-reject="' + row.id + '">Reject</button>' +
        "</div>"
      : "") +
    (row.status === "published"
      ? '<div class="form-grid form-grid-2 mt-1">' +
        '<input type="text" id="pause-note-' + row.id + '" placeholder="Reason for pausing (optional)">' +
        '<button type="button" class="btn btn-secondary" data-pause="' + row.id + '">Pause</button>' +
        "</div>"
      : "") +
    '<div class="form-status" id="detail-status-' + row.id + '" role="status"></div>'
  );
}

function wireDetailActions(id, row, detailRow) {
  function showStatus(kind, message) {
    var el = detailRow.querySelector("#detail-status-" + id);
    if (el) { el.textContent = message; el.className = "form-status is-visible " + kind; }
  }

  var publishBtn = detailRow.querySelector('[data-publish="' + id + '"]');
  if (publishBtn) {
    publishBtn.addEventListener("click", async function () {
      try {
        await apiFetch("/api/talent-services/" + id + "/publish", { method: "POST", body: {} });
        showStatus("success", "Published.");
        await load();
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  }

  var rejectBtn = detailRow.querySelector('[data-reject="' + id + '"]');
  if (rejectBtn) {
    rejectBtn.addEventListener("click", async function () {
      var reason = detailRow.querySelector("#reject-reason-" + id).value.trim();
      if (!reason) {
        showStatus("error", "Enter a reason before rejecting.");
        return;
      }
      try {
        await apiFetch("/api/talent-services/" + id + "/reject", { method: "POST", body: { reason: reason } });
        showStatus("success", "Rejected.");
        await load();
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  }

  var pauseBtn = detailRow.querySelector('[data-pause="' + id + '"]');
  if (pauseBtn) {
    pauseBtn.addEventListener("click", async function () {
      var note = detailRow.querySelector("#pause-note-" + id).value.trim();
      try {
        await apiFetch("/api/talent-services/" + id + "/pause", { method: "POST", body: { note: note || undefined } });
        showStatus("success", "Paused.");
        await load();
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  }
}
