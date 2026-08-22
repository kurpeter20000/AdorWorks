import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

// Kept in sync with ASSISTED_TALENT_FIELDS in
// backend/api/src/routes/assistedOnboarding.js — the server re-validates
// this list regardless, this is just for the checkbox labels.
var ASSISTED_FIELDS = [
  { value: "legal_name", label: "Legal name" },
  { value: "display_name", label: "Display name" },
  { value: "headline", label: "Headline" },
  { value: "bio", label: "Bio" },
  { value: "location", label: "Location" },
  { value: "category", label: "Category" },
  { value: "skills", label: "Skills" },
  { value: "languages", label: "Languages" },
  { value: "availability", label: "Availability" },
];

var requests = [];
var agents = [];
var hubs = [];
var activeFilter = "pending";

var auth = await requireStaffSession();
if (auth) {
  wireFilters();
  wireAddForms();
  await Promise.all([loadHubs(), loadAgents(), loadRequests()]);
}

function wireFilters() {
  document.querySelectorAll("[data-status-filter]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll("[data-status-filter]").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      chip.setAttribute("aria-pressed", "true");
      activeFilter = chip.getAttribute("data-status-filter");
      loadRequests();
    });
  });
}

// ---------------------------------------------------------------------
// Partner hubs
// ---------------------------------------------------------------------

async function loadHubs() {
  var tbody = document.getElementById("hubs-body");
  try {
    var res = await apiFetch("/api/assisted-onboarding/partner-hubs");
    hubs = res.data;
    renderHubs();
    renderHubSelect();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="3" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function renderHubs() {
  var tbody = document.getElementById("hubs-body");
  if (!hubs.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="staff-empty">No partner hubs yet.</td></tr>';
    return;
  }
  tbody.innerHTML = hubs
    .map(function (h) {
      var contact = [h.contact_email, h.contact_phone].filter(Boolean).join(" · ") || "—";
      return (
        "<tr><td>" + escapeHtml(h.name) + "</td><td>" + escapeHtml(h.location || "—") + "</td><td>" +
        escapeHtml(contact) + "</td></tr>"
      );
    })
    .join("");
}

function renderHubSelect() {
  var select = document.getElementById("agent-hub");
  select.innerHTML = hubs.length
    ? hubs.map(function (h) { return '<option value="' + h.id + '">' + escapeHtml(h.name) + "</option>"; }).join("")
    : '<option value="">Add a partner hub first</option>';
}

// ---------------------------------------------------------------------
// Onboarding agents
// ---------------------------------------------------------------------

async function loadAgents() {
  var tbody = document.getElementById("agents-body");
  try {
    var res = await apiFetch("/api/assisted-onboarding/onboarding-agents");
    agents = res.data;
    renderAgents();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="3" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function renderAgents() {
  var tbody = document.getElementById("agents-body");
  if (!agents.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="staff-empty">No onboarding agents yet.</td></tr>';
    return;
  }
  tbody.innerHTML = agents
    .map(function (a) {
      var name = a.profiles ? a.profiles.full_name || a.profiles.phone || a.id : a.id;
      var hub = a.partner_hubs ? a.partner_hubs.name : "—";
      return (
        "<tr><td>" + escapeHtml(name) + "</td><td>" + escapeHtml(hub) + "</td><td>" + statusBadge(a.status) + "</td></tr>"
      );
    })
    .join("");
}

// ---------------------------------------------------------------------
// Assistance requests
// ---------------------------------------------------------------------

async function loadRequests() {
  var tbody = document.getElementById("requests-body");
  tbody.innerHTML = '<tr><td colspan="4" class="staff-empty">Loading…</td></tr>';
  try {
    var qs = activeFilter ? "?status=" + activeFilter + "&limit=100" : "?limit=100";
    var res = await apiFetch("/api/assisted-onboarding/assistance-requests" + qs);
    requests = res.data;
    renderRequests();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function renderRequests() {
  var tbody = document.getElementById("requests-body");
  if (!requests.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="staff-empty">No requests match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = requests
    .map(function (r) {
      var who = r.profiles ? r.profiles.full_name || r.profiles.phone || "Account holder" : "No account yet";
      return (
        '<tr class="is-clickable" data-row-id="' + r.id + '">' +
        "<td>" + escapeHtml(who) + "</td>" +
        "<td>" + escapeHtml(r.reason || "—") + "</td>" +
        "<td>" + statusBadge(r.status) + "</td>" +
        "<td>" + formatDate(r.created_at) + "</td>" +
        "</tr>" +
        '<tr class="detail-row" id="detail-' + r.id + '"><td colspan="4"></td></tr>'
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
  var request = requests.find(function (r) { return r.id === id; });

  if (request.status !== "pending") {
    detailRow.querySelector("td").innerHTML = '<p class="muted mt-0">This request is already ' + escapeHtml(request.status) + ".</p>";
    return;
  }

  var activeAgents = agents.filter(function (a) { return a.status === "active"; });
  var agentOptions = activeAgents.length
    ? activeAgents
        .map(function (a) {
          var name = a.profiles ? a.profiles.full_name || a.profiles.phone || a.id : a.id;
          return '<option value="' + a.id + '">' + escapeHtml(name) + "</option>";
        })
        .join("")
    : "";

  var fieldCheckboxes = ASSISTED_FIELDS.map(function (f) {
    return (
      '<label class="checkbox-label"><input type="checkbox" name="field-' + id + '" value="' + f.value + '"> ' +
      escapeHtml(f.label) + "</label>"
    );
  }).join(" ");

  var needsAccount = !request.requested_by;

  detailRow.querySelector("td").innerHTML =
    '<dl class="kv-list">' +
    "<dt>Reason</dt><dd>" + escapeHtml(request.reason || "—") + "</dd>" +
    "<dt>Preferred contact</dt><dd>" + escapeHtml(request.preferred_channel || "—") + "</dd>" +
    "</dl>" +
    (activeAgents.length
      ? (needsAccount
          ? '<p class="muted mt-1">No account is linked yet — collect an email address and we\'ll create one with a temporary password for you to relay.</p>' +
            '<div class="form-grid form-grid-2 mt-1">' +
            '<input type="email" id="session-email-' + id + '" placeholder="Their email address">' +
            '<input type="text" id="session-fullname-' + id + '" placeholder="Full name (optional)">' +
            "</div>"
          : "") +
        '<div class="form-grid form-grid-2 mt-1">' +
        '<select id="session-agent-' + id + '">' + agentOptions + "</select>" +
        '<input type="number" id="session-minutes-' + id + '" value="60" min="5" max="240" placeholder="Minutes until expiry">' +
        "</div>" +
        '<div class="mt-1">' + fieldCheckboxes + "</div>" +
        '<div class="action-row"><button type="button" class="btn btn-primary" data-start="' + id + '">Start session</button></div>'
      : '<p class="muted">Add an active onboarding agent before starting a session.</p>') +
    '<div class="form-status" id="detail-status-' + id + '" role="status"></div>';

  var startBtn = detailRow.querySelector('[data-start="' + id + '"]');
  if (startBtn) {
    startBtn.addEventListener("click", async function () {
      var statusEl = detailRow.querySelector("#detail-status-" + id);
      var agentId = detailRow.querySelector("#session-agent-" + id).value;
      var minutes = detailRow.querySelector("#session-minutes-" + id).value;
      var fields = Array.from(detailRow.querySelectorAll('input[name="field-' + id + '"]:checked')).map(function (el) {
        return el.value;
      });
      if (!fields.length) {
        statusEl.textContent = "Choose at least one field the agent can help with.";
        statusEl.className = "form-status is-visible error";
        return;
      }
      var body = { agent_id: agentId, fields: fields, expires_in_minutes: Number(minutes) || 60 };
      if (needsAccount) {
        var email = detailRow.querySelector("#session-email-" + id).value.trim();
        if (!email) {
          statusEl.textContent = "Enter their email address — an account needs to be created for them.";
          statusEl.className = "form-status is-visible error";
          return;
        }
        body.email = email;
        var fullName = detailRow.querySelector("#session-fullname-" + id).value.trim();
        if (fullName) body.full_name = fullName;
      }
      try {
        var res = await apiFetch("/api/assisted-onboarding/assistance-requests/" + id + "/start-session", {
          method: "POST",
          body: body,
        });
        statusEl.textContent = res.temporary_password
          ? "Session started. Account created — temporary password (relay this to them, it won’t be shown again): " + res.temporary_password
          : "Session started — the assisted person will see a consent prompt next time they sign in.";
        statusEl.className = "form-status is-visible success";
        await loadRequests();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = "form-status is-visible error";
      }
    });
  }
}

// ---------------------------------------------------------------------
// Add hub / add agent forms
// ---------------------------------------------------------------------

function wireAddForms() {
  document.getElementById("add-hub-btn").addEventListener("click", async function () {
    var statusEl = document.getElementById("hub-form-status");
    var name = document.getElementById("hub-name").value.trim();
    if (!name) {
      statusEl.textContent = "Enter a hub name.";
      statusEl.className = "form-status is-visible error";
      return;
    }
    try {
      await apiFetch("/api/assisted-onboarding/partner-hubs", {
        method: "POST",
        body: {
          name: name,
          location: document.getElementById("hub-location").value.trim() || undefined,
          contact_email: document.getElementById("hub-email").value.trim() || undefined,
          contact_phone: document.getElementById("hub-phone").value.trim() || undefined,
        },
      });
      document.getElementById("hub-name").value = "";
      document.getElementById("hub-location").value = "";
      document.getElementById("hub-email").value = "";
      document.getElementById("hub-phone").value = "";
      statusEl.textContent = "Added.";
      statusEl.className = "form-status is-visible success";
      await loadHubs();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "form-status is-visible error";
    }
  });

  document.getElementById("add-agent-btn").addEventListener("click", async function () {
    var statusEl = document.getElementById("agent-form-status");
    var email = document.getElementById("agent-email").value.trim();
    var hubId = document.getElementById("agent-hub").value;
    if (!email || !hubId) {
      statusEl.textContent = "Enter the agent's email and choose a partner hub.";
      statusEl.className = "form-status is-visible error";
      return;
    }
    try {
      var res = await apiFetch("/api/assisted-onboarding/onboarding-agents", {
        method: "POST",
        body: {
          email: email,
          full_name: document.getElementById("agent-name").value.trim() || undefined,
          partner_hub_id: hubId,
        },
      });
      document.getElementById("agent-email").value = "";
      document.getElementById("agent-name").value = "";
      statusEl.textContent = res.temporary_password
        ? "Added. Temporary password (give this to the agent, it won’t be shown again): " + res.temporary_password
        : "Added — this account already existed, their existing password still works.";
      statusEl.className = "form-status is-visible success";
      await loadAgents();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "form-status is-visible error";
    }
  });
}
