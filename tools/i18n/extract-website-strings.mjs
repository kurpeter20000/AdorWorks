#!/usr/bin/env node
// Collects every piece of English text on the public website into
// i18n/website.csv, the translators' spreadsheet.
//
//   node tools/i18n/extract-website-strings.mjs
//
// Each page is opened in a real browser (Playwright, borrowed from
// platform/node_modules) and js/i18n.js's own AdorI18n.collect() lists
// the text — the exact same code the live site uses to look text up, so
// a key extracted here always matches at runtime.
//
// Merging is safe to repeat: existing translations are kept, new English
// text is added with empty translations, and rows whose English no
// longer appears anywhere are kept but marked "not on site" in `where`
// (so a translator's work is never deleted by a wording tweak).
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, writeCsv } from "./csv.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CSV_PATH = join(ROOT, "i18n", "website.csv");
const require = createRequire(join(ROOT, "platform", "package.json"));
const { chromium } = require("playwright");

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(ROOT, path === "/" ? "index.html" : path));
  if (!file.startsWith(normalize(ROOT)) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
const found = new Map(); // english -> Set(pages)

const browser = await chromium.launch();
try {
  for (const page of pages) {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await tab.addInitScript(() => {
      window.__AW_I18N_EXTRACT__ = true;
      try {
        localStorage.setItem("aw_lang", "en");
      } catch {}
    });
    tab.on("pageerror", (e) => console.warn(`  ${page} script error: ${e.message}`));
    await tab.goto(`${base}/${page}`, { waitUntil: "load", timeout: 60000 });
    // Let live job listings and other scripted content render; a page with
    // a background video may never go fully network-idle, so cap the wait.
    await tab.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await tab.waitForTimeout(800);
    const keys = await tab.evaluate(() => (window.AdorI18n ? window.AdorI18n.collect() : null));
    if (!keys) throw new Error(`${page}: js/i18n.js did not load — is it included on this page?`);
    for (const k of keys) {
      if (!found.has(k)) found.set(k, new Set());
      found.get(k).add(page.replace(/\.html$/, ""));
    }
    console.log(`${page}: ${keys.length} strings`);
    await tab.close();
  }
} finally {
  await browser.close();
  server.close();
}

const existing = existsSync(CSV_PATH) ? parseCsv(readFileSync(CSV_PATH, "utf8")) : [];
const byEnglish = new Map(existing.map((r) => [r.english, r]));
const rows = [];
for (const [english, where] of found) {
  const prev = byEnglish.get(english);
  rows.push({ ...(prev ?? {}), english, where: [...where].join(" ") });
  byEnglish.delete(english);
}
for (const leftover of byEnglish.values()) {
  if (!leftover.english) continue;
  // "manual" rows are added by hand for text the crawl can't see (e.g. the
  // plural "{n} open opportunities" when only one job happens to be open).
  if (/\bmanual\b/.test(leftover.where ?? "")) rows.push(leftover);
  else if (leftover.arabic || leftover.swahili) rows.push({ ...leftover, where: "not on site" });
}
writeFileSync(CSV_PATH, writeCsv(rows));
const missing = (lang) => rows.filter((r) => r.where !== "not on site" && !r[lang]).length;
console.log(`\n${rows.length} rows in i18n/website.csv — untranslated: Arabic ${missing("arabic")}, Swahili ${missing("swahili")}`);
