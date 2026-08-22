import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

var rows = [];
var activeFilter = "pending";

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

  detailRow.querySelector("td").innerHTML =
    '<dl class="kv-list">' +
    "<dt>Website</dt><dd>" + (row.website ? '<a href="' + escapeHtml(row.website) + '" target="_blank" rel="noopener">' + escapeHtml(row.website) + "</a>" : "—") + "</dd>" +
    "<dt>Billing email</dt><dd>" + escapeHtml(row.billing_email || "—") + "</dd>" +
    "<dt>Risk notes</dt><dd>" + escapeHtml(row.risk_notes || "—") + "</dd>" +
    "</dl>" +
    '<div class="form-grid form-grid-2 mt-1">' +
    '<select id="status-input-' + id + '">' + options + "</select>" +
    '<input type="text" id="notes-input-' + id + '" placeholder="Risk notes (optional)" value="' + escapeHtml(row.risk_notes || "") + '">' +
    "</div>" +
    '<div class="action-row"><button type="button" class="btn btn-primary" data-save="' + id + '">Save verification status</button></div>' +
    '<div class="form-status" id="detail-status-' + id + '" role="status"></div>';

  detailRow.querySelector('[data-save="' + id + '"]').addEventListener("click", async function () {
    var statusEl = detailRow.querySelector("#detail-status-" + id);
    var newStatus = detailRow.querySelector("#status-input-" + id).value;
    var notes = detailRow.querySelector("#notes-input-" + id).value;
    try {
      await apiFetch("/api/organisations/" + id + "/verify", {
        method: "PATCH",
        body: { verification_status: newStatus, risk_notes: notes || undefined },
      });
      statusEl.textContent = "Saved.";
      statusEl.className = "form-status is-visible success";
      await load();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "form-status is-visible error";
    }
  });
}
