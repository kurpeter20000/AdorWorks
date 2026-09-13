import { supabase } from "./app.js";

/**
 * S04-08 — for a staff account that already has a verified TOTP factor
 * but this particular session hasn't completed a challenge yet (e.g. a
 * fresh login). Not gated through requireStaffSession() for the same
 * reason as mfa-setup.js — that function sends people here.
 */
(async function () {
  var { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    window.location.href = "login.html";
    return;
  }

  var form = document.getElementById("mfa-challenge-form");
  var status = document.getElementById("mfa-status");

  // .totp is always verified-only by listFactors()'s own contract.
  var { data: factorsData, error: listError } = await supabase.auth.mfa.listFactors();
  var factorId = !listError && factorsData.totp[0] ? factorsData.totp[0].id : null;
  if (!factorId) {
    status.textContent = "Something's inconsistent with your account's two-factor setup. Contact another admin for help.";
    status.className = "form-status is-visible error";
    form.style.display = "none";
    return;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.className = "form-status";
    var code = document.getElementById("mfa-code").value.trim();
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying…";

    var { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factorId });
    if (challengeError) {
      status.textContent = challengeError.message;
      status.className = "form-status is-visible error";
      submitBtn.disabled = false;
      submitBtn.textContent = "Verify";
      return;
    }

    var { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factorId,
      challengeId: challenge.id,
      code: code,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Verify";

    if (verifyError) {
      status.textContent = "That code didn't work — check your authenticator app and try again.";
      status.className = "form-status is-visible error";
      return;
    }

    window.location.href = new URLSearchParams(location.search).get("next") || "index.html";
  });
})();
