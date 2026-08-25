import { supabase } from "./app.js";

var form = document.getElementById("forgot-form");
var status = document.getElementById("forgot-status");

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  var email = document.getElementById("forgot-email").value.trim();
  var submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname.replace(/forgot-password\.html$/, "reset-password.html"),
  });

  // Always show the same message, whether or not the email matched an
  // account — confirming/denying that here would let someone enumerate
  // staff accounts.
  submitBtn.disabled = false;
  submitBtn.textContent = "Send reset link";
  status.textContent = "If that email matches a staff account, we've sent a link to reset the password.";
  status.className = "form-status is-visible success";
  form.reset();
});
