// The public site's shared header and footer (redesign 2026, from the
// approved SiteHeader / SiteFooter designs). The pages are plain static
// HTML with no build step, so these are copied into every page by
// tools/site/apply-partials.mjs — edit here, then run that script.
//
// The language switcher is added into the nav by js/i18n.js; the Services
// menu and mobile drawer are driven by js/main.js (data-* hooks below).

const APP = "https://ador-works.vercel.app";

/** Which nav item each page belongs to. */
export const ACTIVE = {
  "jobs-projects.html": "jobs",
  "for-employers.html": "talent",
  "services.html": "services",
  "pathways.html": "pathways",
  "how-it-works.html": "how",
  "trust-safety.html": "trust",
};

const SERVICES = [
  {
    key: "creative",
    name: "Creative &amp; media",
    tag: "Design → delivery",
    items: [
      ["Brand &amp; graphic design", "Brand%20%26%20graphic%20design", "Logos, brand marks and print-ready collateral"],
      ["Photography &amp; video production", "Photography%20%26%20video%20production", "Shoot days with fully edited assets"],
      ["Editing &amp; animation", "Editing%20%26%20animation", "Video editing, motion graphics and animation"],
      ["Content creation &amp; copywriting", "Content%20creation%20%26%20copywriting", "Written and social content, on brief"],
    ],
  },
  {
    key: "digital",
    name: "Digital &amp; technology",
    tag: "Build → handover",
    items: [
      ["Web development", "Web%20development", "Websites and web apps, handed over with training"],
      ["Data support &amp; analytics", "Data%20support%20%26%20analytics", "Clean data, dashboards and simple reports"],
      ["Digital advertising", "Digital%20advertising", "Campaign setup, targeting and reporting"],
      ["IT &amp; software support", "IT%20%26%20software%20support", "Setup, fixes and ongoing help for your team"],
    ],
  },
  {
    key: "business",
    name: "Business &amp; project support",
    tag: "One-off or ongoing",
    items: [
      ["Virtual assistance &amp; bookkeeping", "Virtual%20assistance%20%26%20bookkeeping", "Admin, scheduling and tidy books"],
      ["Research &amp; enumeration", "Research%20%26%20enumeration", "Surveys, field data collection and desk research"],
      ["Transcription &amp; translation", "Transcription%20%26%20translation", "Arabic, English, Kiswahili and local languages"],
      ["Project administration", "Project%20administration", "Tracking, reporting and coordination"],
    ],
  },
];

const current = (active, key) => (active === key ? ' aria-current="page"' : "");

export function header(page) {
  const active = ACTIVE[page] ?? null;
  const groups = SERVICES.map(
    (c) => `
              <div class="mm-col" data-megamenu-items="${c.key}">
                <p class="mm-cat">${c.name}</p>
                <p class="mm-tag">${c.tag}</p>
                <ul>
${c.items
  .map(
    ([n, q, d]) => `                  <li><a class="mm-item" href="services.html?service=${q}#service-deck-${c.key}"><strong>${n}</strong><small>${d}</small></a></li>`
  )
  .join("\n")}
                </ul>
              </div>`
  ).join("");
  return `<header class="site-header">
  <div class="container">
    <a class="brand" href="index.html">
      <img src="img/adorworks-mark.svg" alt="AdorWorks" width="34" height="34">
      <span>AdorWorks</span>
    </a>
    <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav">
      <span class="visually-hidden">Menu</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Primary">
      <ul>
        <li><a href="jobs-projects.html"${current(active, "jobs")}>Find work</a></li>
        <li><a href="for-employers.html"${current(active, "talent")}>Find talent</a></li>
        <li class="nav-megamenu" data-nav-megamenu>
          <button type="button" class="nav-megamenu-trigger${active === "services" ? " is-current" : ""}" data-megamenu-trigger aria-expanded="false" aria-controls="services-megamenu">
            Services
            <svg class="nav-megamenu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="services-megamenu" id="services-megamenu" data-megamenu-panel>
            <div class="mm-grid">${groups}
              <div class="mm-note">
                <p class="mm-note-text">Prices are agreed with you before any work starts.</p>
                <a href="services.html">Browse all services &rarr;</a>
                <a href="pricing.html">How pricing works &rarr;</a>
                <a href="how-it-works.html">See how it works &rarr;</a>
              </div>
            </div>
          </div>
        </li>
        <li><a href="pathways.html"${current(active, "pathways")}>Pathways</a></li>
        <li><a href="how-it-works.html"${current(active, "how")}>How it works</a></li>
        <li><a href="trust-safety.html"${current(active, "trust")}>Trust &amp; Safety</a></li>
        <li class="nav-login"><a href="${APP}/login">Log in</a></li>
        <li class="nav-cta"><a href="for-employers.html#brief-form" class="btn btn-primary">Post a project</a></li>
      </ul>
    </nav>
  </div>
</header>`;
}

export function footer() {
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="index.html">
          <img src="img/adorworks-mark-reversed.svg" alt="AdorWorks" width="32" height="32">
          <span>AdorWorks</span>
        </a>
        <p class="footer-tagline">A South Sudan-born talent and work marketplace.</p>
        <p class="footer-about">Built by Adormedia. 0% platform fee for talent during our founding pilot &middot; every shortlist is human-reviewed.</p>
      </div>
      <nav aria-label="Explore">
        <h2 class="footer-heading">Explore</h2>
        <ul class="footer-list">
          <li><a href="services.html">Services</a></li>
          <li><a href="jobs-projects.html">Jobs &amp; projects</a></li>
          <li><a href="pathways.html">Pathways for schools</a></li>
          <li><a href="how-it-works.html">How it works</a></li>
          <li><a href="pricing.html">Pricing</a></li>
          <li><a href="impact-stories.html">Impact &amp; stories</a></li>
          <li><a href="insights.html">Insights</a></li>
        </ul>
      </nav>
      <nav aria-label="Company">
        <h2 class="footer-heading">Company</h2>
        <ul class="footer-list">
          <li><a href="for-employers.html">For employers</a></li>
          <li><a href="for-talent.html">For talent</a></li>
          <li><a href="assisted-hiring.html">Assisted hiring</a></li>
          <li><a href="trust-safety.html">Trust &amp; Safety</a></li>
          <li><a href="about.html">About</a></li>
        </ul>
      </nav>
      <nav aria-label="Support">
        <h2 class="footer-heading">Support</h2>
        <ul class="footer-list">
          <li><a href="help.html">Help &amp; FAQ</a></li>
          <li><a href="contact.html">Contact us</a></li>
          <li><a href="trust-safety.html#report">Report a concern</a></li>
          <li><a href="trust-safety.html#policies">Legal policies</a></li>
        </ul>
      </nav>
    </div>
    <div class="footer-bottom">
      <span>&copy; 2026 AdorWorks, a venture of Adormedia Ltd. <span class="footer-note">AdorWorks is a working name pending company, trademark and domain clearance.</span></span>
      <span><a href="mailto:info@adorworks.net">info@adorworks.net</a> &middot; South Sudan</span>
    </div>
  </div>
</footer>`;
}
