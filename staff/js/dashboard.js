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
var TILE_QUERIES = [
  ["stat-new-intake", "intake_submissions", "status", "new"],
  ["stat-pending-orgs", "organisations", "verification_status", "pending"],
  ["stat-pending-opps", "opportunities", "status", "pending_review"],
  ["stat-pending-videos", "talent_introduction_videos", "status", "pending"],
  ["stat-active-engagements", "engagements", "status", ["proposed", "contracted", "active"]],
  ["stat-open-disputes", "disputes", "status", ["open", "investigating"]],
  ["stat-open-reports", "reports", "status", "open"],
  ["stat-open-opportunities", "opportunities", "status", "open"],
  ["stat-published-services", "talent_services", "status", "published"],
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
  var [countsOk] = await Promise.all([loadCounts(), loadRecentIntake()]);
  if (refreshBtn) refreshBtn.disabled = false;
  setUpdatedAt(countsOk);
  if (!countsOk) showError();
}

function setUpdatedAt(ok) {
  var el = document.getElementById("dashboard-updated");
  if (!el) return;
  var when = formatDate(new Date().toISOString());
  el.textContent = ok ? "Updated " + when : "Last attempt failed — " + when;
}

function showError() {
  var el = document.getElementById("dashboard-error");
  if (el) el.hidden = false;
}

function hideError() {
  var el = document.getElementById("dashboard-error");
  if (el) el.hidden = true;
}

async function countWhere(table, column, value) {
  var q = supabase.from(table).select("*", { count: "exact", head: true });
  if (Array.isArray(value)) q = q.in(column, value);
  else q = q.eq(column, value);
  var { count, error } = await q;
  return { ok: !error, count: count };
}

/** @returns {Promise<boolean>} whether every tile loaded without error. */
async function loadCounts() {
  TILE_QUERIES.forEach(function (t) { setTileLoading(t[0]); });
  var results = await Promise.all(
    TILE_QUERIES.map(function (t) {
      return countWhere(t[1], t[2], t[3]).then(function (r) { return { id: t[0], result: r }; });
    })
  );
  var allOk = true;
  results.forEach(function (r) {
    if (r.result.ok) setTile(r.id, r.result.count);
    else {
      setTileError(r.id);
      allOk = false;
    }
  });
  return allOk;
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
