#!/usr/bin/env node
// Collects every translatable string in the platform app into i18n/app.csv.
//
//   node tools/i18n/extract-app-strings.mjs
//
// Finds t("…") and msg("…") calls with a plain string literal in
// platform/src (see platform/src/i18n/config.ts). Same merge rules as the
// website extractor: translations are never lost; English that's no longer
// in the code is kept as "not in app" if it was translated.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, writeCsv } from "./csv.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(ROOT, "platform", "src");
const CSV_PATH = join(ROOT, "i18n", "app.csv");
// The staff console is internal and stays English.
const SKIP_DIRS = [join(SRC, "app", "operations")];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_DIRS.includes(p)) continue;
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx?|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

// t("…") / msg("…") with a double- or single-quoted literal (no template strings).
const CALL = /\b(?:t|msg)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
function decode(literal) {
  const body = literal.slice(1, -1);
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e) => {
    if (e[0] === "u") return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ""), 16));
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: "\n", t: "\t" }[e] ?? e;
  });
}

const found = new Map(); // english -> Set(where)
for (const file of files(SRC)) {
  const text = readFileSync(file, "utf8");
  const where = relative(SRC, file).replace(/\\/g, "/").replace(/\/(page|layout)\.tsx$/, "").replace(/\.(tsx?|mjs)$/, "");
  for (const m of text.matchAll(CALL)) {
    const english = decode(m[1]);
    if (!/[A-Za-z]/.test(english)) continue;
    if (!found.has(english)) found.set(english, new Set());
    found.get(english).add(where);
  }
}

const existing = existsSync(CSV_PATH) ? parseCsv(readFileSync(CSV_PATH, "utf8")) : [];
const byEnglish = new Map(existing.map((r) => [r.english, r]));
const rows = [];
for (const [english, where] of [...found].sort((a, b) => [...a[1]][0].localeCompare([...b[1]][0]))) {
  const prev = byEnglish.get(english);
  const list = [...where];
  rows.push({ ...(prev ?? {}), english, where: list.slice(0, 3).join(" ") + (list.length > 3 ? ` +${list.length - 3}` : "") });
  byEnglish.delete(english);
}
for (const leftover of byEnglish.values()) {
  if (leftover.english && (leftover.arabic || leftover.swahili)) rows.push({ ...leftover, where: "not in app" });
}
writeFileSync(CSV_PATH, writeCsv(rows));
const missing = (c) => rows.filter((r) => r.where !== "not in app" && !r[c]).length;
console.log(`${rows.length} rows in i18n/app.csv — untranslated: Arabic ${missing("arabic")}, Swahili ${missing("swahili")}`);
