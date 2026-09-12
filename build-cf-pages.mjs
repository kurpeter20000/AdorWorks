#!/usr/bin/env node
// Cloudflare Pages build step for the public static site.
//
// Copies only the files this site actually needs to serve into a
// dedicated output directory (_site/) — so backend/, platform/, docs/,
// .github/, tools/, and repo-management files (README.md, netlify.toml,
// render.yaml, .gitignore) are never uploaded as deployable assets in
// the first place. This replaces relying on _redirects to block those
// paths after the fact: confirmed live that a Cloudflare Pages redirect
// does NOT reliably override a request whose path matches a real
// uploaded file (e.g. /render.yaml kept serving the real file instead of
// hitting its /404.html redirect) — an allowlisted output directory is
// the only fix that's actually robust, independent of that behavior.
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

const DIRS = ["css", "js", "img", "staff"];

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

// staff/README.md documents the console for developers, not something
// the running app needs — no reason to publish it alongside the rest.
rmSync(join(OUT_DIR, "staff", "README.md"), { force: true });

console.log(`Copied ${htmlFiles.length} HTML pages + ${DIRS.length} directories into ${OUT_DIR}`);
