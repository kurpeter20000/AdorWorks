#!/usr/bin/env node
// Cloudflare Pages build step for the public static site.
//
// Copies only the files this site actually needs to serve into a
// dedicated output directory (_site/) — so backend/, platform/, docs/,
// .github/, tools/, and repo-management files (README.md, render.yaml,
// .gitignore) are never uploaded as deployable assets in the first
// place. This replaces relying on _redirects to block those paths after
// the fact: confirmed live that a Cloudflare Pages redirect does NOT
// reliably override a request whose path matches a real uploaded file
// (e.g. /render.yaml kept serving the real file instead of hitting its
// /404.html redirect) — an allowlisted output directory is the only fix
// that's actually robust, independent of that behavior.
//
// _headers and _redirects still ship (copied into _site/ below) as
// defense in depth, but nothing in the public output directory should
// ever need them to block a path — there's simply nothing sensitive in
// there to begin with.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "_site");

const FILES = ["manifest.webmanifest", "sw.js", "robots.txt", "sitemap.xml", "_headers", "_redirects"];

// staff/ is no longer published: the staff console moved into the platform
// app at /operations, and _redirects sends old /staff links there.
const DIRS = ["css", "js", "img"];

// Every top-level *.html file, whatever the current page count is —
// avoids a second hand-maintained list that will drift from reality.
const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith(".html") && statSync(join(ROOT, f)).isFile());

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const f of [...FILES, ...htmlFiles]) {
  cpSync(join(ROOT, f), join(OUT_DIR, f));
}
for (const d of DIRS) {
  cpSync(join(ROOT, d), join(OUT_DIR, d), { recursive: true });
}

// Translations: rebuild i18n/ar.json + sw.json from the translators'
// spreadsheet (i18n/website.csv) on every deploy, so an edited CSV reaches
// the site with no extra step. Only the JSON is published, not the CSV.
const { buildDictionaries } = await import("./tools/i18n/build-dictionaries.mjs");
buildDictionaries({ quiet: true });
mkdirSync(join(OUT_DIR, "i18n"), { recursive: true });
for (const f of readdirSync(join(ROOT, "i18n")).filter((f) => f.endsWith(".json"))) {
  cpSync(join(ROOT, "i18n", f), join(OUT_DIR, "i18n", f));
}

console.log(`Copied ${htmlFiles.length} HTML pages + ${DIRS.length} directories + translations into ${OUT_DIR}`);
