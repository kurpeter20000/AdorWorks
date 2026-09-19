import "server-only";

/**
 * S11-03: every transactional email up to now (contracts.ts, applications.ts)
 * built its own inline HTML string by hand — no shared header/footer/brand,
 * no support contact, and (S11-10) no escaping of user-supplied text
 * (an employer's free-text rejection reason, or an opportunity title, both
 * landed straight in the HTML). This is the one shared template both call
 * sites now use.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@adorworks.org";

/**
 * `paragraphs` are inserted as-is (already-built HTML fragments) — callers
 * must run any user-supplied text through escapeHtml() themselves before
 * interpolating it into a paragraph, same as any other HTML string build.
 */
export function renderEmail(input: {
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  /** S11-08 — every email now carries one, built from unsubscribeToken.ts at the call site. */
  unsubscribeUrl?: string;
}): string {
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#c8391a;color:#ffffff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(input.ctaLabel)}</a></p>`
      : "";
  const body = input.paragraphs
    .map((p) => `<p style="margin:0 0 14px;color:#1f2933;font-size:15px;line-height:1.5;">${p}</p>`)
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2ee;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="background:#f4f2ee;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f2a3d;padding:20px 24px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;">AdorWorks</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 16px;font-size:18px;color:#0f2a3d;">${escapeHtml(input.heading)}</h1>
                ${body}
                ${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f4f2ee;border-top:1px solid #e4e0d8;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:12px;line-height:1.5;">
                  You're receiving this because of activity on your AdorWorks account
                  (${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}). Need help? Contact
                  ${escapeHtml(SUPPORT_EMAIL)}.
                  ${input.unsubscribeUrl ? ` <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b7280;">Unsubscribe from activity emails</a>.` : ""}
                </p>
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                  AdorWorks staff will never ask you for your password, a one-time code, or your payment PIN by
                  email. If something in this message looks off, contact ${escapeHtml(SUPPORT_EMAIL)} before
                  clicking anything.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
