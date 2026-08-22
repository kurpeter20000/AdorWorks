import "server-only";

/**
 * Africa's Talking has no dedicated "Verify"/OTP product (unlike Twilio
 * Verify) — this just sends a plain SMS. The code generation, hashing,
 * expiry and attempt-limiting all live in the calling Server Action
 * (see lib/actions/phone.ts); this module's only job is the HTTP call.
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const apiKey = process.env.AFRICAS_TALKING_API_KEY;
  const username = process.env.AFRICAS_TALKING_USERNAME;
  if (!apiKey || !username) {
    throw new Error(
      "Missing AFRICAS_TALKING_API_KEY or AFRICAS_TALKING_USERNAME — copy .env.local.example to .env.local and fill both in."
    );
  }

  // "sandbox" is Africa's Talking's own username for their test API —
  // matching it here avoids needing a separate environment flag.
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";

  const response = await fetch(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ username, to, message }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Africa's Talking SMS send failed (${response.status}): ${body || response.statusText}`);
  }
}
