import { supabase } from "./app.js";

/**
 * S04-08 — staff MFA enrollment. Not gated through requireStaffSession()
 * (that function sends people HERE, so it can't also gate this page —
 * see app.js), just a plain "is there a session at all" check.
 */
(async function () {
  var { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    window.location.href = "login.html";
    return;
  }

  var qrImg = document.getElementById("mfa-qr");
  var secretEl = document.getElementById("mfa-secret");
  var form = document.getElementById("mfa-setup-form");
  var status = document.getElementById("mfa-status");

  // Clean up any stale unverified factor first — enroll() only returns
  // the QR/secret at the moment of enrollment, not on a later page
  // load, so a stale half-finished enrollment would leave no way to
  // show a working QR code again without this.
  var { data: factorsData } = await supabase.auth.mfa.listFactors();
  var stalePending = ((factorsData && factorsData.all) || []).find(function (f) {
    return f.factor_type === "totp" && f.status === "unverified";
  });
  if (stalePending) {
    await supabase.auth.mfa.unenroll({ factorId: stalePending.id });
  }

  var { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (enrollError) {
    status.textContent = enrollError.message;
    status.className = "form-status is-visible error";
    form.style.display = "none";
    return;
  }

  qrImg.src = enrollData.totp.qr_code;
  secretEl.textContent = enrollData.totp.secret;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.className = "form-status";
    var code = document.getElementById("mfa-code").value.trim();
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying…";

    var { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollData.id });
    if (challengeError) {
      status.textContent = challengeError.message;
      status.className = "form-status is-visible error";
      submitBtn.disabled = false;
      submitBtn.textContent = "Verify and continue";
      return;
    }

    var { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollData.id,
      challengeId: challenge.id,
      code: code,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Verify and continue";

    if (verifyError) {
      status.textContent = "That code didn't work — check your authenticator app and try again.";
      status.className = "form-status is-visible error";
      return;
    }

    window.location.href = new URLSearchParams(location.search).get("next") || "index.html";
  });
})();
