import { supabase } from "./app.js";

var form = document.getElementById("reset-form");
var status = document.getElementById("reset-status");
var ready = false;

status.textContent = "Verifying reset link…";
status.className = "form-status is-visible";

// Supabase's client parses the recovery token out of the URL on load and
// fires PASSWORD_RECOVERY once that session is established — there's no
// synchronous way to know it's ready, so gate the form on this event
// rather than assuming getSession() alone is fast enough yet.
supabase.auth.onAuthStateChange(function (event, session) {
  if (session && !ready) {
    ready = true;
    status.className = "form-status";
    status.textContent = "";
    form.style.display = "";
  }
});

setTimeout(function () {
  if (!ready) {
    status.textContent = "This reset link is invalid or has expired — request a new one from the sign-in page.";
    status.className = "form-status is-visible error";
  }
}, 4000);

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  var password = document.getElementById("reset-password").value;
  var submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  var { error } = await supabase.auth.updateUser({ password: password });

  submitBtn.disabled = false;
  submitBtn.textContent = "Set new password";

  if (error) {
    status.textContent = error.message;
    status.className = "form-status is-visible error";
    return;
  }
  status.textContent = "Password updated — redirecting…";
  status.className = "form-status is-visible success";
  setTimeout(function () { window.location.href = "index.html"; }, 1200);
});
