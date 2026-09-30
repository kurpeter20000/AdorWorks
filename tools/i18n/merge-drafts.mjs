#!/usr/bin/env node
// Merges machine-drafted translations into a translators' spreadsheet.
//
//   node tools/i18n/merge-drafts.mjs website i18n/drafts/website-*.json
//
// Each draft file maps a row number (as printed when the drafts were
// written) to [arabic, swahili]; manual.json maps English text directly.
// Drafts only fill EMPTY cells and are marked "draft" — anything a
// translator has already written or marked is never overwritten.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, writeCsv } from "./csv.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const [surface, ...files] = process.argv.slice(2);
const csvPath = join(ROOT, "i18n", `${surface}.csv`);
const rows = parseCsv(readFileSync(csvPath, "utf8"));
const byEnglish = new Map(rows.map((r) => [r.english, r]));

let filled = 0;
function fill(row, ar, sw) {
  if (ar && !row.arabic) {
    row.arabic = ar;
    row.arabic_status = "draft";
    filled++;
  }
  if (sw && !row.swahili) {
    row.swahili = sw;
    row.swahili_status = "draft";
    filled++;
  }
}

for (const file of files) {
  const data = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  if (file.endsWith("manual.json")) {
    for (const [english, [ar, sw, where]] of Object.entries(data)) {
      let row = byEnglish.get(english);
      if (!row) {
        row = { english, where: where || "manual" };
        rows.push(row);
        byEnglish.set(english, row);
      }
      fill(row, ar, sw);
    }
    continue;
  }
  for (const [index, [ar, sw]] of Object.entries(data)) {
    const row = rows[Number(index)];
    if (!row) throw new Error(`${file}: row ${index} does not exist`);
    fill(row, ar, sw);
  }
}

writeFileSync(csvPath, writeCsv(rows));
const missing = (c) => rows.filter((r) => r.where !== "not on site" && !r[c]).length;
console.log(`${filled} cells filled. Still empty: Arabic ${missing("arabic")}, Swahili ${missing("swahili")} (of ${rows.length})`);
