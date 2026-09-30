// S15-09 — Lighthouse CI's puppeteerScript hook (loaded via plain
// require(), hence CommonJS not ESM): called once per URL in
// .lighthouserc.authenticated.json's collect list, before Lighthouse
// navigates there. Signs in via the real login form so every
// authenticated page in the budget is measured as a real logged-in user
// would experience it, not redirected to /login and measured empty.
//
// Two separate test accounts (talent vs. employer) share this file —
// which one to use is picked per-URL by whether the URL contains
// "/organisation". Both accounts must already exist in the target
// Supabase project; see scripts/seed-lighthouse-users.mjs.

const TALENT_EMAIL = process.env.LH_TALENT_EMAIL;
const TALENT_PASSWORD = process.env.LH_TALENT_PASSWORD;
const EMPLOYER_EMAIL = process.env.LH_EMPLOYER_EMAIL;
const EMPLOYER_PASSWORD = process.env.LH_EMPLOYER_PASSWORD;

module.exports = async function login(browser, context) {
  const isEmployerPage = context.url.includes("/organisation");
  const email = isEmployerPage ? EMPLOYER_EMAIL : TALENT_EMAIL;
  const password = isEmployerPage ? EMPLOYER_PASSWORD : TALENT_PASSWORD;
  if (!email || !password) {
    throw new Error("LH_TALENT_EMAIL/LH_TALENT_PASSWORD/LH_EMPLOYER_EMAIL/LH_EMPLOYER_PASSWORD must all be set for authenticated Lighthouse runs.");
  }

  const page = await browser.newPage();
  // LHCI reuses one browser (and its cookie jar) across every URL in the
  // collect list, so a session from the previous URL's login would still
  // be active here — clear it first so /login always renders the form
  // instead of redirecting an already-signed-in user straight through.
  const client = await page.createCDPSession();
  await client.send("Network.clearBrowserCookies");
  const origin = new URL(context.url).origin;
  await page.goto(`${origin}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[type="email"], input[name="email"]');
  await page.type('input[type="email"], input[name="email"]', email);
  await page.type('input[type="password"], input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('button[type="submit"]'),
  ]);
  await page.close();
};
