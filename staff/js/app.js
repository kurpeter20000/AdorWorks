// Shared across every staff page. Loaded as a module (<script type="module">),
// after staff/js/config.js has set window.ADORWORKS_*.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STAFF_ROLES = new Set(["reviewer", "matcher", "finance", "admin"]);

export const supabase = createClient(
  window.ADORWORKS_SUPABASE_URL,
  window.ADORWORKS_SUPABASE_ANON_KEY
);

/**
 * Call at the top of every protected page. Redirects to login.html if
 * there's no session, or shows an "access denied" state if the account
 * exists but isn't staff (RLS would block everything anyway — this is
 * just a faster, clearer message than a screen full of empty tables).
 * Returns { session, profile } on success.
 */
export async function requireStaffSession() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    window.location.href = "login.html?next=" + encodeURIComponent(location.pathname + location.search);
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, status")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    renderAccessDenied("No staff profile found for this account.");
    return null;
  }
  if (profile.status !== "active") {
    renderAccessDenied("This account is not active.");
    return null;
  }
  if (!STAFF_ROLES.has(profile.role)) {
    renderAccessDenied(
      "This account (" + profile.role + ") doesn't have staff access. Ask an admin to change your role in Supabase — see backend/supabase/README.md."
    );
    return null;
  }

  var whoEl = document.getElementById("staff-who");
  if (whoEl) whoEl.textContent = (profile.full_name || session.user.email) + " · " + profile.role;

  return { session: session, profile: profile };
}

function renderAccessDenied(message) {
  var main = document.getElementById("main") || document.body;
  main.innerHTML =
    '<div class="container section"><div class="notice"><span class="notice-label">Access denied</span>' +
    "<p class=\"mt-0 mb-0\">" + escapeHtml(message) + '</p></div>' +
    '<p class="mt-1"><a href="login.html" class="btn btn-secondary">Back to login</a></p></div>';
}

/** Wires a logout button (id="logout-btn") present on every staff page. */
export function initLogout() {
  var btn = document.getElementById("logout-btn");
  if (!btn) return;
  btn.addEventListener("click", async function () {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

/**
 * Calls the staff API (backend/api) with the current session's token.
 * Throws an Error with a readable message on any failure, including
 * "API not configured" if ADORWORKS_API_BASE_URL is still blank.
 */
export async function apiFetch(path, options) {
  options = options || {};
  if (!window.ADORWORKS_API_BASE_URL) {
    throw new Error(
      "The staff API isn't deployed/configured yet (staff/js/config.js has no API_BASE_URL) — see backend/api/README.md."
    );
  }
  var { data: sessionData } = await supabase.auth.getSession();
  var token = sessionData?.session?.access_token;
  if (!token) throw new Error("Your session has expired — please log in again.");

  var res = await fetch(window.ADORWORKS_API_BASE_URL.replace(/\/$/, "") + path, {
    method: options.method || "GET",
    headers: Object.assign(
      { "Content-Type": "application/json", Authorization: "Bearer " + token },
      options.headers || {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  var body = null;
  try {
    body = await res.json();
  } catch (err) {
    /* empty/non-JSON response body */
  }
  if (!res.ok) {
    throw new Error((body && body.error) || "Request failed (" + res.status + ").");
  }
  return body;
}

export function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

export function formatDate(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Shows a message in a .form-status-style element (id="page-status"), reusing the site's existing form-status CSS. */
export function setPageStatus(kind, message) {
  var el = document.getElementById("page-status");
  if (!el) return;
  el.textContent = message;
  el.className = "form-status is-visible " + kind;
}

/** Small badge helper — maps a status/tier/stage string to a coloured <span class="status-badge ...">. */
export function statusBadge(value) {
  var tone = STATUS_TONE[value] || "neutral";
  return '<span class="status-badge status-' + tone + '">' + escapeHtml(String(value).replace(/_/g, " ")) + "</span>";
}

var STATUS_TONE = {
  new: "info", in_review: "warning", converted: "success", archived: "neutral",
  pending: "warning", verified: "success", rejected: "danger", suspended: "danger",
  draft: "neutral", pending_review: "warning", open: "success", filled: "info", closed: "neutral", cancelled: "danger",
  changes_required: "warning", paused: "neutral", published: "success", removed: "neutral",
  submitted: "neutral", shortlisted: "info", interviewing: "info", offered: "warning", accepted: "success", withdrawn: "neutral",
  proposed: "neutral", contracted: "info", active: "success", completed: "success", disputed: "danger",
  approved: "success",
  registered: "neutral", identity_verified: "info", adorverified: "success", adorcertified: "success", team_lead: "success",
  investigating: "warning", resolved: "success", escalated: "danger",
  confirmed: "success", reconciled: "success",
  revision_requested: "warning", paid: "success", sent: "info", declined: "danger",
  succeeded: "success", failed: "danger", refunded: "warning",
};
