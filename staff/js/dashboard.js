import { supabase, requireStaffSession, initLogout, escapeHtml, formatDate, statusBadge } from "./app.js";

initLogout();

var auth = await requireStaffSession();
if (auth) {
  await loadCounts();
  await loadRecentIntake();
}

async function countWhere(table, column, value) {
  var q = supabase.from(table).select("*", { count: "exact", head: true });
  if (Array.isArray(value)) q = q.in(column, value);
  else q = q.eq(column, value);
  var { count, error } = await q;
  if (error) return "—";
  return count;
}

async function loadCounts() {
  var [newIntake, pendingOrgs, pendingOpps, activeEngagements, openDisputes] = await Promise.all([
    countWhere("intake_submissions", "status", "new"),
    countWhere("organisations", "verification_status", "pending"),
    countWhere("opportunities", "status", "pending_review"),
    countWhere("engagements", "status", ["proposed", "contracted", "active"]),
    countWhere("disputes", "status", ["open", "investigating"]),
  ]);
  setTile("stat-new-intake", newIntake);
  setTile("stat-pending-orgs", pendingOrgs);
  setTile("stat-pending-opps", pendingOpps);
  setTile("stat-active-engagements", activeEngagements);
  setTile("stat-open-disputes", openDisputes);
}

function setTile(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadRecentIntake() {
  var { data, error } = await supabase
    .from("intake_submissions")
    .select("id, form_type, status, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(8);

  var body = document.getElementById("recent-intake-body");
  if (error) {
    body.innerHTML = '<tr><td colspan="4" class="staff-empty">Could not load recent submissions.</td></tr>';
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
