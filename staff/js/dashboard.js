import { supabase, requireStaffSession, initLogout, escapeHtml, formatDate, statusBadge } from "./app.js";

// Declared here, before the top-level await below, on purpose: this
// module's top-level `await requireStaffSession()` pauses execution
// before the module reaches TILE_QUERIES' original position further
// down the file, so refreshAll() -> loadCounts() ran with TILE_QUERIES
// still undefined (its `var` hoists the name but not the assignment) —
// every count query silently never fired, and the dashboard never
// finished loading. Confirmed live: zero organisations/opportunities/
// etc. requests ever left the browser, and TILE_QUERIES.forEach threw
// "Cannot read properties of undefined" on every load.
// 5th element is a human label used only in the error banner/console when
// this specific query fails — see countWhere()'s doc comment for why that
// was worth adding.
var TILE_QUERIES = [
  ["stat-new-intake", "intake_submissions", "status", "new", "New intake submissions"],
  ["stat-pending-orgs", "organisations", "verification_status", "pending", "Organisations pending verification"],
  ["stat-pending-opps", "opportunities", "status", "pending_review", "Opportunities pending review"],
  ["stat-pending-videos", "talent_introduction_videos", "status", "pending", "Introduction videos pending review"],
  ["stat-active-engagements", "engagements", "status", ["proposed", "contracted", "active"], "Engagements in flight"],
  ["stat-open-disputes", "disputes", "status", ["open", "investigating"], "Open disputes"],
  ["stat-open-reports", "reports", "status", "open", "Open reports"],
  ["stat-open-opportunities", "opportunities", "status", "open", "Open opportunities"],
  ["stat-published-services", "talent_services", "status", "published", "Published services"],
];

initLogout();

var auth = await requireStaffSession();
if (auth) {
  wireRefresh();
  await refreshAll();
}

function wireRefresh() {
  var btn = document.getElementById("dashboard-refresh");
  if (btn) btn.addEventListener("click", refreshAll);
  var retryBtn = document.getElementById("dashboard-retry");
  if (retryBtn) retryBtn.addEventListener("click", refreshAll);
}

async function refreshAll() {
  var refreshBtn = document.getElementById("dashboard-refresh");
  if (refreshBtn) refreshBtn.disabled = true;
  hideError();
  var [counts] = await Promise.all([loadCounts(), loadRecentIntake()]);
  if (refreshBtn) refreshBtn.disabled = false;
  setUpdatedAt(counts.ok);
  if (!counts.ok) showError(counts.failedLabels);
}

function setUpdatedAt(ok) {
  var el = document.getElementById("dashboard-updated");
  if (!el) return;
  var when = formatDate(new Date().toISOString());
  el.textContent = ok ? "Updated " + when : "Last attempt failed — " + when;
}

/**
 * Was a plain "Some figures below could not be loaded" with no way to
 * tell which one, or why — every retry looked identical whether it was
 * one flaky tile or all nine, and the real Postgrest error (permissions?
 * a renamed column? a timeout?) was discarded in countWhere() before it
 * ever reached here. Names the specific tile(s) so it's diagnosable
 * without guessing, instead of just "try again and hope".
 */
function showError(failedLabels) {
  var el = document.getElementById("dashboard-error");
  if (!el) return;
  var msg = document.getElementById("dashboard-error-message");
  if (msg) {
    msg.textContent =
      failedLabels && failedLabels.length
        ? "Could not load: " + failedLabels.join(", ") + ". See the browser console for the exact error."
        : "Some figures below could not be loaded.";
  }
  el.hidden = false;
}

function hideError() {
  var el = document.getElementById("dashboard-error");
  if (el) el.hidden = true;
}

/**
 * The `error` from a failed count used to be discarded entirely (only
 * `ok: false` survived) — the dashboard could tell *that* a tile failed
 * but nothing about *why*, so "Retry" was the only available move even
 * for a permissions/schema error that would never succeed on retry.
 * Logged with the table/column/label so it's identifiable in devtools
 * without reproducing the query by hand.
 */
async function countWhere(table, column, value, label) {
  var q = supabase.from(table).select("*", { count: "exact", head: true });
  if (Array.isArray(value)) q = q.in(column, value);
  else q = q.eq(column, value);
  var { count, error } = await q;
  if (error) {
    console.error('[dashboard] "' + label + '" (' + table + "." + column + ") failed:", error);
  }
  return { ok: !error, count: count };
}

/** @returns {Promise<{ok: boolean, failedLabels: string[]}>} */
async function loadCounts() {
  TILE_QUERIES.forEach(function (t) { setTileLoading(t[0]); });
  var results = await Promise.all(
    TILE_QUERIES.map(function (t) {
      return countWhere(t[1], t[2], t[3], t[4]).then(function (r) { return { id: t[0], label: t[4], result: r }; });
    })
  );
  var allOk = true;
  var failedLabels = [];
  results.forEach(function (r) {
    if (r.result.ok) setTile(r.id, r.result.count);
    else {
      setTileError(r.id);
      allOk = false;
      failedLabels.push(r.label);
    }
  });
  return { ok: allOk, failedLabels: failedLabels };
}

function setTileLoading(id) {
  var tile = document.getElementById(id)?.closest(".stat-tile");
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = "…";
  tile?.classList.remove("is-error");
  tile?.classList.add("is-loading");
}

function setTile(id, value) {
  var tile = document.getElementById(id)?.closest(".stat-tile");
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  tile?.classList.remove("is-loading", "is-error");
}

function setTileError(id) {
  var tile = document.getElementById(id)?.closest(".stat-tile");
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = "!";
  tile?.classList.remove("is-loading");
  tile?.classList.add("is-error");
}

async function loadRecentIntake() {
  var body = document.getElementById("recent-intake-body");
  if (body) body.innerHTML = '<tr><td colspan="4" class="staff-empty">Loading…</td></tr>';

  var { data, error } = await supabase
    .from("intake_submissions")
    .select("id, form_type, status, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(8);

  if (!body) return;
  if (error) {
    body.innerHTML =
      '<tr><td colspan="4" class="staff-empty">Could not load recent submissions. ' +
      '<button type="button" class="btn btn-secondary" id="recent-intake-retry">Retry</button></td></tr>';
    document.getElementById("recent-intake-retry")?.addEventListener("click", loadRecentIntake);
    return;
  }
  if (!data.length) {
    body.innerHTML = '<tr><td colspan="4" class="staff-empty">No submissions yet.</td></tr>';
    return;
  }
  body.innerHTML = data
    .map(function (row) {
      var name = row.payload?.name || row.payload?.organisation || row.payload?.representative_name || "—";
      return (
        "<tr>" +
        "<td>" + escapeHtml(row.form_type.replace(/_/g, " ")) + "</td>" +
        "<td>" + escapeHtml(name) + "</td>" +
        "<td>" + statusBadge(row.status) + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        "</tr>"
      );
    })
    .join("");
}
