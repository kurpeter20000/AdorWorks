import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge, setPageStatus } from "./app.js";

initLogout();

var ROLES = [
  "talent", "individual_client", "employer", "org_admin", "org_member",
  "reviewer", "matcher", "finance", "admin", "onboarding_agent", "partner_hub_admin",
];

var rows = [];
var searchTimer = null;

var auth = await requireStaffSession();
if (auth) {
  wireControls();
  wireAddStaffForm();
  await load();
}

function wireControls() {
  document.getElementById("role-select").addEventListener("change", load);
  document.getElementById("name-search").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
  });
}

function wireAddStaffForm() {
  var form = document.getElementById("add-staff-form");
  var status = document.getElementById("add-staff-status");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("add-staff-email").value.trim();
    var fullName = document.getElementById("add-staff-name").value.trim();
    var role = document.getElementById("add-staff-role").value;
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding…";
    status.className = "form-status";

    try {
      var res = await apiFetch("/api/people/staff", {
        method: "POST",
        body: { email: email, fullName: fullName || undefined, role: role },
      });
      var who = res.data.full_name || res.data.email;
      if (res.temporaryPassword) {
        status.textContent =
          "Added " + who + " as " + role + ". One-time password (shown once — relay it directly): " + res.temporaryPassword;
      } else {
        status.textContent = "Promoted " + who + " to " + role + ".";
      }
      status.className = "form-status is-visible success";
      form.reset();
      await load();
    } catch (err) {
      status.textContent = err.message;
      status.className = "form-status is-visible error";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add staff";
    }
  });
}

async function load() {
  var tbody = document.getElementById("people-body");
  tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">Loading…</td></tr>';
  try {
    var role = document.getElementById("role-select").value;
    var q = document.getElementById("name-search").value.trim();
    var params = new URLSearchParams({ limit: "100" });
    if (role) params.set("role", role);
    if (q) params.set("q", q);
    var res = await apiFetch("/api/people?" + params.toString());
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("people-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">No accounts match this filter.</td></tr>';
    return;
  }
  var roleOptions = ROLES.map(function (r) { return '<option value="' + r + '">' + r + "</option>"; }).join("");

  tbody.innerHTML = rows
    .map(function (row) {
      return (
        "<tr>" +
        "<td>" + escapeHtml(row.full_name || "—") + "</td>" +
        "<td>" + escapeHtml(row.email || "—") + "</td>" +
        "<td>" + statusBadge(row.role) + "</td>" +
        "<td>" + statusBadge(row.status) + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        "<td>" +
        '<div class="action-row">' +
        '<select id="role-input-' + row.id + '">' + roleOptions.replace('value="' + row.role + '"', 'value="' + row.role + '" selected') + "</select>" +
        '<button type="button" class="btn btn-secondary" data-save="' + row.id + '">Save</button>' +
        "</div>" +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  rows.forEach(function (row) {
    tbody.querySelector('[data-save="' + row.id + '"]').addEventListener("click", async function () {
      var newRole = document.getElementById("role-input-" + row.id).value;
      try {
        await apiFetch("/api/people/" + row.id + "/role", { method: "PATCH", body: { role: newRole } });
        setPageStatus("success", "Updated " + (row.full_name || row.email || row.id) + " to " + newRole + ".");
        await load();
      } catch (err) {
        setPageStatus("error", err.message);
      }
    });
  });
}
