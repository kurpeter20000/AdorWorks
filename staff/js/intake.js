import { supabase, requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

var rows = [];
var activeFilter = { status: "new", form_type: "" };

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
      activeFilter.status = chip.getAttribute("data-status-filter");
      load();
    });
  });
  document.getElementById("form-type-select").addEventListener("change", function (e) {
    activeFilter.form_type = e.target.value;
    load();
  });
}

async function load() {
  var tbody = document.getElementById("intake-body");
  tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Loading…</td></tr>';

  var q = supabase.from("intake_submissions").select("*").order("created_at", { ascending: false }).limit(100);
  if (activeFilter.status) q = q.eq("status", activeFilter.status);
  if (activeFilter.form_type) q = q.eq("form_type", activeFilter.form_type);

  var { data, error } = await q;
  if (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Could not load submissions: ' + escapeHtml(error.message) + "</td></tr>";
    return;
  }
  rows = data;
  render();
}

function render() {
  var tbody = document.getElementById("intake-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="staff-empty">Nothing here.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      var name = row.payload?.name || row.payload?.organisation || row.payload?.representative_name || row.payload?.email || "—";
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.form_type.replace(/_/g, " ")) + "</td>" +
        "<td>" + escapeHtml(name) + "</td>" +
        "<td>" + statusBadge(row.status) + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        '<td><a href="#" class="view-link">View &rarr;</a></td>' +
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

  var row = rows.find(function (r) { return r.id === id; });
  detailRow.querySelector("td").innerHTML = renderDetail(row);
  wireDetailActions(row, detailRow);
  detailRow.classList.add("is-open");
}

function renderDetail(row) {
  var payloadItems = Object.entries(row.payload || {})
    .map(function ([k, v]) {
      return "<dt>" + escapeHtml(k.replace(/_/g, " ")) + "</dt><dd>" + escapeHtml(v || "—") + "</dd>";
    })
    .join("");

  var convertedNote = row.status === "converted"
    ? '<p class="text-sm muted mt-1">Converted to <code>' + escapeHtml(row.converted_to_table) + "</code> (id <code>" + escapeHtml(row.converted_to_id) + "</code>) on " + formatDate(row.reviewed_at) + "</p>"
    : "";

  var actions = "";
  if (row.status !== "converted" && row.status !== "archived") {
    if (row.status === "new") actions += '<button type="button" class="btn btn-secondary" data-action="in_review">Mark in review</button>';
    if (row.form_type === "talent_application") actions += '<button type="button" class="btn btn-primary" data-action="convert-talent">Convert to talent profile</button>';
    if (row.form_type === "employer_brief") actions += '<button type="button" class="btn btn-primary" data-action="convert-employer">Convert to organisation + opportunity</button>';
    actions += '<button type="button" class="btn btn-secondary" data-action="archive">Archive</button>';
  }

  return (
    '<dl class="kv-list">' + payloadItems + "</dl>" +
    convertedNote +
    '<div class="action-row">' + actions + "</div>" +
    '<div class="form-status" id="detail-status-' + row.id + '" role="status"></div>'
  );
}

function wireDetailActions(row, detailRow) {
  var statusEl = detailRow.querySelector("#detail-status-" + row.id);

  function showStatus(kind, message) {
    statusEl.textContent = message;
    statusEl.className = "form-status is-visible " + kind;
  }

  detailRow.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var action = btn.getAttribute("data-action");
      btn.disabled = true;
      try {
        if (action === "in_review") {
          await apiFetch("/api/intake/" + row.id, { method: "PATCH", body: { status: "in_review" } });
        } else if (action === "archive") {
          await apiFetch("/api/intake/" + row.id, { method: "PATCH", body: { status: "archived" } });
        } else if (action === "convert-talent") {
          await apiFetch("/api/intake/" + row.id + "/convert-talent", { method: "POST", body: {} });
        } else if (action === "convert-employer") {
          await apiFetch("/api/intake/" + row.id + "/convert-employer", { method: "POST", body: {} });
        }
        showStatus("success", "Done.");
        await load();
      } catch (err) {
        showStatus("error", err.message);
        btn.disabled = false;
      }
    });
  });
}
