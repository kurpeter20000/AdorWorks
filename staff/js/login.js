import { supabase } from "./app.js";

(async function () {
  // Already signed in? Skip straight past the login form.
  var { data } = await supabase.auth.getSession();
  if (data?.session) {
    window.location.href = new URLSearchParams(location.search).get("next") || "index.html";
    return;
  }

  var form = document.getElementById("login-form");
  var status = document.getElementById("login-status");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.className = "form-status";
    var email = document.getElementById("login-email").value.trim();
    var password = document.getElementById("login-password").value;

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    var { error } = await supabase.auth.signInWithPassword({ email: email, password: password });

    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";

    if (error) {
      status.textContent = error.message;
      status.className = "form-status is-visible error";
      return;
    }
    window.location.href = new URLSearchParams(location.search).get("next") || "index.html";
  });
})();
