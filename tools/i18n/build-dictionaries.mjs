#!/usr/bin/env node
// Turns the translators' spreadsheets into the files the site and app read:
//   i18n/website.csv -> i18n/ar.json, i18n/sw.json            (public website)
//   i18n/app.csv     -> platform/src/i18n/messages/{ar,sw}.json (platform app)
//
//   node tools/i18n/build-dictionaries.mjs
//
// Also run automatically by build-cf-pages.mjs on every website deploy, so
// a translator's CSV edit reaches the website without anyone running this.
// The app's JSON is committed (Vercel builds only platform/), so after
// editing app.csv, run this and commit the result.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toDictionary } from "./csv.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function buildDictionaries({ quiet = false } = {}) {
  const jobs = [
    { csv: "i18n/website.csv", out: (lang) => `i18n/${lang}.json` },
    { csv: "i18n/app.csv", out: (lang) => `platform/src/i18n/messages/${lang}.json` },
  ];
  for (const job of jobs) {
    const csvPath = join(ROOT, job.csv);
    if (!existsSync(csvPath)) continue;
    const rows = parseCsv(readFileSync(csvPath, "utf8"));
    for (const [lang, column] of [
      ["ar", "arabic"],
      ["sw", "swahili"],
    ]) {
      const dict = toDictionary(rows, column);
      const outPath = join(ROOT, job.out(lang));
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(dict, null, 0) + "\n");
      if (!quiet) console.log(`${job.out(lang)}: ${Object.keys(dict).length} of ${rows.length} strings`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) buildDictionaries();
