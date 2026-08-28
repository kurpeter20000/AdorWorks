import { requireStaffSession, initLogout, apiFetch, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

var rows = [];
var activeFilter = "pending_review";
var orgOptions = [];

var auth = await requireStaffSession();
if (auth) {
  wireFilters();
  wireCreateForm();
  await loadOrgOptions();
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

async function loadOrgOptions() {
  try {
    var res = await apiFetch("/api/organisations?limit=200");
    orgOptions = res.data;
    document.getElementById("create-org").innerHTML = orgOptions
      .map(function (o) { return '<option value="' + o.id + '">' + escapeHtml(o.name) + " (" + o.verification_status + ")</option>"; })
      .join("");
  } catch (err) {
    // Non-fatal — the create form just won't have organisations to pick from yet.
  }
}

function wireCreateForm() {
  var toggle = document.getElementById("create-toggle");
  var panel = document.getElementById("create-panel");
  toggle.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
  });

  document.getElementById("create-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var statusEl = document.getElementById("create-status");
    var skills = document.getElementById("create-skills").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var body = {
      organisation_id: document.getElementById("create-org").value,
      type: document.getElementById("create-type").value,
      title: document.getElementById("create-title").value,
      brief: document.getElementById("create-brief").value || undefined,
      category: document.getElementById("create-category").value || undefined,
      skills: skills.length ? skills : undefined,
      location: document.getElementById("create-location").value || undefined,
      currency: document.getElementById("create-currency").value || undefined,
    };
    var budgetMin = document.getElementById("create-budget-min").value;
    var budgetMax = document.getElementById("create-budget-max").value;
    if (budgetMin) body.budget_min = Number(budgetMin);
    if (budgetMax) body.budget_max = Number(budgetMax);

    try {
      await apiFetch("/api/opportunities", { method: "POST", body: body });
      statusEl.textContent = "Created.";
      statusEl.className = "form-status is-visible success";
      e.target.reset();
      panel.hidden = true;
      await load();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "form-status is-visible error";
    }
  });
}

async function load() {
  var tbody = document.getElementById("opps-body");
  tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">Loading…</td></tr>';
  try {
    var qs = activeFilter ? "?status=" + activeFilter + "&limit=100" : "?limit=100";
    var res = await apiFetch("/api/opportunities" + qs);
    rows = res.data;
    render();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">' + escapeHtml(err.message) + "</td></tr>";
  }
}

function render() {
  var tbody = document.getElementById("opps-body");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="staff-empty">No opportunities match this filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(function (row) {
      return (
        '<tr class="is-clickable" data-row-id="' + row.id + '">' +
        "<td>" + escapeHtml(row.title) + "</td>" +
        "<td>" + escapeHtml(row.organisations?.name || "—") + "</td>" +
        "<td>" + escapeHtml(row.type.replace(/_/g, " ")) + "</td>" +
        "<td>" + (row.shortlisting_mode === "self_service"
          ? '<span class="status-badge status-info">Self-service</span>'
          : '<span class="status-badge status-neutral">Staff</span>') + "</td>" +
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
  await refreshDetail(id);
}

async function refreshDetail(id) {
  var detailRow = document.getElementById("detail-" + id);
  var row = rows.find(function (r) { return r.id === id; });
  detailRow.querySelector("td").innerHTML = renderDetailShell(row);
  wireDetailActions(id, row, detailRow);
  await loadApplications(id, row, detailRow);
  await loadSuggestedCandidates(id, row, detailRow);
}

function wireAddToShortlistButtons(listEl, oppId, detailRow, opportunity) {
  listEl.querySelectorAll("[data-add-candidate]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      try {
        await apiFetch("/api/applications", {
          method: "POST",
          body: { opportunity_id: oppId, talent_id: btn.getAttribute("data-add-candidate") },
        });
        btn.replaceWith(document.createTextNode("Added."));
        await loadApplications(oppId, opportunity, detailRow);
        await loadSuggestedCandidates(oppId, opportunity, detailRow);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });
}

// Structured, skill-based candidate suggestions — the explainable-matching
// and fair-visibility counterpart to the free-text headline search below.
// Ranked by how many of the opportunity's required skills a candidate
// lists, then by recency (not rating or tenure), so a brand-new profile
// with matching skills surfaces exactly as readily as an established one.
async function loadSuggestedCandidates(oppId, opportunity, detailRow) {
  var list = detailRow.querySelector("#suggested-candidates-" + oppId);
  if (!list) return;
  if (!opportunity.category) {
    list.innerHTML = "<li>No category set on this opportunity — use the search below instead.</li>";
    return;
  }
  try {
    var alreadyShortlisted = {};
    try {
      var appsRes = await apiFetch("/api/applications?opportunity_id=" + oppId + "&limit=100");
      appsRes.data.forEach(function (a) { alreadyShortlisted[a.talent_id] = true; });
    } catch (e) {
      // non-fatal — worst case a candidate already shortlisted appears again
    }

    var res = await apiFetch("/api/talent?category=" + encodeURIComponent(opportunity.category) + "&limit=100");
    var oppSkills = (opportunity.skills || []).map(function (s) { return s.toLowerCase(); });

    var candidates = res.data
      .filter(function (t) { return !alreadyShortlisted[t.id]; })
      .map(function (t) {
        var talentSkills = t.skills || [];
        var matches = talentSkills.filter(function (s) { return oppSkills.indexOf(s.toLowerCase()) !== -1; });
        return { talent: t, matches: matches };
      })
      .filter(function (c) { return oppSkills.length === 0 || c.matches.length > 0; })
      .sort(function (a, b) {
        if (b.matches.length !== a.matches.length) return b.matches.length - a.matches.length;
        return new Date(b.talent.created_at) - new Date(a.talent.created_at);
      })
      .slice(0, 8);

    if (!candidates.length) {
      list.innerHTML = "<li>No structured skill matches yet — try a manual search below.</li>";
      return;
    }

    list.innerHTML = candidates
      .map(function (c) {
        var matchLabel = c.matches.length
          ? "Matches: " + c.matches.map(escapeHtml).join(", ")
          : "No listed skills overlap — shown for category fit";
        return (
          "<li><strong>" + escapeHtml(c.talent.headline || c.talent.id) + "</strong> — " + statusBadge(c.talent.verification_tier) +
          '<div class="staff-hint">' + matchLabel + "</div>" +
          '<div class="action-row">' +
          '<button type="button" class="btn btn-secondary" data-add-candidate="' + c.talent.id + '">Add to shortlist</button>' +
          "</div></li>"
        );
      })
      .join("");
    wireAddToShortlistButtons(list, oppId, detailRow, opportunity);
  } catch (err) {
    list.innerHTML = "<li>" + escapeHtml(err.message) + "</li>";
  }
}

var OPP_STATUSES = ["draft", "pending_review", "open", "filled", "closed", "cancelled", "rejected", "changes_required", "paused"];

function renderDetailShell(row) {
  var statusOptions = OPP_STATUSES
    .map(function (s) { return '<option value="' + s + '"' + (s === row.status ? " selected" : "") + ">" + s.replace(/_/g, " ") + "</option>"; })
    .join("");

  return (
    '<div class="detail-grid detail-grid-2">' +
    "<div>" +
    '<dl class="kv-list">' +
    "<dt>Brief</dt><dd>" + escapeHtml(row.brief || "—") + "</dd>" +
    (row.service_packages ? "<dt>Package</dt><dd>" + escapeHtml(row.service_packages.title) + "</dd>" : "") +
    "<dt>Skills</dt><dd>" + escapeHtml((row.skills || []).join(", ") || "—") + "</dd>" +
    "<dt>Location</dt><dd>" + escapeHtml(row.location || "—") + "</dd>" +
    "<dt>Budget</dt><dd>" + escapeHtml(row.budget_min || "—") + "–" + escapeHtml(row.budget_max || "—") + " " + escapeHtml(row.currency || "") + "</dd>" +
    (row.status === "rejected" ? "<dt>Rejection reason</dt><dd>" + escapeHtml(row.rejection_reason || "—") + "</dd>" : "") +
    (row.status === "changes_required" || row.status === "paused"
      ? "<dt>" + (row.status === "paused" ? "Pause note" : "Requested changes") + "</dt><dd>" + escapeHtml(row.status_note || "—") + "</dd>"
      : "") +
    "</dl>" +
    '<div class="form-grid form-grid-2 mt-1">' +
    '<select id="status-input-' + row.id + '">' + statusOptions + "</select>" +
    '<button type="button" class="btn btn-secondary" data-save-status="' + row.id + '">Update status</button>' +
    "</div>" +
    (row.status === "pending_review"
      ? '<div class="action-row">' +
        '<button type="button" class="btn btn-primary" data-approve="' + row.id + '">Approve &amp; open</button>' +
        "</div>" +
        '<div class="form-grid form-grid-2 mt-1">' +
        '<input type="text" id="reject-reason-' + row.id + '" placeholder="Reason for rejecting (required)">' +
        '<button type="button" class="btn btn-secondary" data-reject="' + row.id + '">Reject</button>' +
        "</div>" +
        '<div class="form-grid form-grid-2 mt-1">' +
        '<input type="text" id="request-changes-note-' + row.id + '" placeholder="What needs to change (required)">' +
        '<button type="button" class="btn btn-secondary" data-request-changes="' + row.id + '">Request changes</button>' +
        "</div>"
      : "") +
    (row.status === "open"
      ? '<div class="form-grid form-grid-2 mt-1">' +
        '<input type="text" id="pause-note-' + row.id + '" placeholder="Reason for pausing (optional)">' +
        '<button type="button" class="btn btn-secondary" data-pause="' + row.id + '">Pause</button>' +
        "</div>"
      : "") +
    '<div class="form-status" id="detail-status-' + row.id + '" role="status"></div>' +
    "</div>" +
    "<div>" +
    "<h3>Shortlist</h3>" +
    (row.shortlisting_mode === "self_service"
      ? '<p class="staff-hint">This employer chose to shortlist candidates themselves — you can still help below if asked.</p>'
      : "") +
    '<ul class="staff-events" id="applications-list-' + row.id + '"><li>Loading…</li></ul>' +
    "<h4 class=\"mt-1\">Suggested candidates</h4>" +
    '<p class="staff-hint">Ranked by skill overlap with this opportunity, then most recently joined — not by rating or tenure, so new talent surface on equal footing.</p>' +
    '<ul class="staff-events" id="suggested-candidates-' + row.id + '"><li>Loading…</li></ul>' +
    "<h4 class=\"mt-1\">Search by headline</h4>" +
    '<div class="form-grid form-grid-2">' +
    '<input type="text" id="candidate-search-' + row.id + '" placeholder="Search by headline…">' +
    '<button type="button" class="btn btn-secondary" data-search-candidates="' + row.id + '">Search</button>' +
    "</div>" +
    '<ul class="staff-events" id="candidate-results-' + row.id + '"></ul>' +
    "</div>" +
    "</div>"
  );
}

async function loadApplications(oppId, opportunity, detailRow) {
  var list = detailRow.querySelector("#applications-list-" + oppId);
  try {
    var res = await apiFetch("/api/applications?opportunity_id=" + oppId + "&limit=50");
    if (!res.data.length) {
      list.innerHTML = "<li>No one shortlisted yet.</li>";
      return;
    }
    var STAGES = ["submitted", "shortlisted", "interviewing", "offered", "accepted", "rejected", "withdrawn"];
    list.innerHTML = res.data
      .map(function (a) {
        var stageOptions = STAGES.map(function (s) { return '<option value="' + s + '"' + (s === a.stage ? " selected" : "") + ">" + s + "</option>"; }).join("");
        var engagementBtn = a.stage === "accepted"
          ? '<button type="button" class="btn btn-primary" data-create-engagement="' + a.id + '" data-talent-id="' + a.talent_id + '">Create engagement</button>'
          : "";
        return (
          "<li><strong>" + escapeHtml(a.talent_profiles?.headline || a.talent_id) + "</strong> — " +
          escapeHtml((a.talent_profiles?.category || "").replace(/_/g, " ")) + " · " +
          statusBadge(a.talent_profiles?.verification_tier || "—") +
          '<div class="action-row">' +
          '<select data-application-stage="' + a.id + '">' + stageOptions + "</select>" +
          engagementBtn +
          "</div></li>"
        );
      })
      .join("");
    list.querySelectorAll("[data-application-stage]").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        try {
          await apiFetch("/api/applications/" + sel.getAttribute("data-application-stage"), {
            method: "PATCH",
            body: { stage: sel.value },
          });
          await loadApplications(oppId, opportunity, detailRow);
        } catch (err) {
          alert(err.message);
        }
      });
    });
    list.querySelectorAll("[data-create-engagement]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          await apiFetch("/api/engagements", {
            method: "POST",
            body: {
              opportunity_id: oppId,
              application_id: btn.getAttribute("data-create-engagement"),
              talent_id: btn.getAttribute("data-talent-id"),
              organisation_id: opportunity.organisation_id,
            },
          });
          btn.replaceWith(document.createTextNode("Engagement created — see the Engagements page."));
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    list.innerHTML = "<li>" + escapeHtml(err.message) + "</li>";
  }
}

function wireDetailActions(id, row, detailRow) {
  function showStatus(kind, message) {
    var el = detailRow.querySelector("#detail-status-" + id);
    if (el) { el.textContent = message; el.className = "form-status is-visible " + kind; }
  }

  var approveBtn = detailRow.querySelector('[data-approve="' + id + '"]');
  if (approveBtn) {
    approveBtn.addEventListener("click", async function () {
      try {
        await apiFetch("/api/opportunities/" + id + "/approve", { method: "POST", body: {} });
        showStatus("success", "Approved.");
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
        await apiFetch("/api/opportunities/" + id + "/reject", { method: "POST", body: { reason: reason } });
        showStatus("success", "Rejected.");
        await load();
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  }

  var requestChangesBtn = detailRow.querySelector('[data-request-changes="' + id + '"]');
  if (requestChangesBtn) {
    requestChangesBtn.addEventListener("click", async function () {
      var note = detailRow.querySelector("#request-changes-note-" + id).value.trim();
      if (!note) {
        showStatus("error", "Say what needs to change before requesting changes.");
        return;
      }
      try {
        await apiFetch("/api/opportunities/" + id + "/request-changes", { method: "POST", body: { note: note } });
        showStatus("success", "Changes requested.");
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
        await apiFetch("/api/opportunities/" + id + "/pause", { method: "POST", body: { note: note || undefined } });
        showStatus("success", "Paused.");
        await load();
      } catch (err) {
        showStatus("error", err.message);
      }
    });
  }

  var saveStatusBtn = detailRow.querySelector('[data-save-status="' + id + '"]');
  saveStatusBtn.addEventListener("click", async function () {
    var newStatus = detailRow.querySelector("#status-input-" + id).value;
    try {
      await apiFetch("/api/opportunities/" + id, { method: "PATCH", body: { status: newStatus } });
      showStatus("success", "Saved.");
      await load();
    } catch (err) {
      showStatus("error", err.message);
    }
  });

  var searchBtn = detailRow.querySelector('[data-search-candidates="' + id + '"]');
  searchBtn.addEventListener("click", async function () {
    var q = detailRow.querySelector("#candidate-search-" + id).value.trim();
    var resultsEl = detailRow.querySelector("#candidate-results-" + id);
    resultsEl.innerHTML = "<li>Searching…</li>";
    try {
      var res = await apiFetch("/api/talent" + (q ? "?q=" + encodeURIComponent(q) + "&limit=10" : "?limit=10"));
      if (!res.data.length) {
        resultsEl.innerHTML = "<li>No matches.</li>";
        return;
      }
      resultsEl.innerHTML = res.data
        .map(function (t) {
          return (
            "<li>" + escapeHtml(t.headline || t.id) + " — " + statusBadge(t.verification_tier) +
            ' <button type="button" class="btn btn-secondary" data-add-candidate="' + t.id + '" style="margin-left:0.5em;">Add to shortlist</button></li>'
          );
        })
        .join("");
      wireAddToShortlistButtons(resultsEl, id, detailRow, row);
    } catch (err) {
      resultsEl.innerHTML = "<li>" + escapeHtml(err.message) + "</li>";
    }
  });
}
