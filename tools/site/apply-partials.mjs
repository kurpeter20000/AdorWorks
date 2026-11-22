#!/usr/bin/env node
// Copies the shared header and footer (tools/site/partials.mjs) into every
// page of the public site, marks the current page in the menu, and makes
// sure each page loads the redesign's fonts and stylesheet. Safe to run
// any number of times.
//
//   node tools/site/apply-partials.mjs          # rewrite pages
//   node tools/site/apply-partials.mjs --check  # exit 1 if any page is out of date (CI)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { header, footer } from "./partials.mjs";

const ROOT = process.cwd();
// The offline page must render with no network, so it keeps its own
// minimal header and footer.
const SKIP = new Set(["offline.html"]);
const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">';
const SITE_CSS = '<link rel="stylesheet" href="css/site.css?v=29">';

const check = process.argv.includes("--check");
const stale = [];

for (const page of readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  if (SKIP.has(page)) continue;
  const path = join(ROOT, page);
  const before = readFileSync(path, "utf8");
  let s = before;

  s = s.replace(/<header class="site-header">[\s\S]*?<\/header>/, header(page));
  s = s.replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, footer());
  s = s.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet">/, FONTS);
  if (!s.includes(SITE_CSS)) {
    s = s.replace('<link rel="stylesheet" href="css/styles.css">', `<link rel="stylesheet" href="css/styles.css">\n${SITE_CSS}`);
  }

  if (s !== before) {
    if (check) stale.push(page);
    else writeFileSync(path, s);
  }
}

if (check && stale.length) {
  console.error(`Out of date — run node tools/site/apply-partials.mjs: ${stale.join(", ")}`);
  process.exit(1);
}
console.log(check ? "All pages up to date." : "Header and footer applied.");
