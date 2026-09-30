// Tiny RFC 4180 CSV reader/writer for the translation spreadsheets.
// No dependencies on purpose: build-cf-pages.mjs uses it inside the
// Cloudflare Pages build, which installs nothing.
//
// Files are written with a UTF-8 byte-order mark and CRLF line endings,
// which is what Excel needs to open Arabic/Swahili text correctly by
// double-click (Google Sheets and LibreOffice handle it either way).

export const COLUMNS = ["english", "arabic", "arabic_status", "swahili", "swahili_status", "where", "notes"];

export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((f) => f !== ""));
  if (!header) return [];
  const names = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i] ?? ""])));
}

function cell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsv(rows, columns = COLUMNS) {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * english -> translation, for rows that have one. Rows whose status is
 * "hold" are left out (a translator flagged them as not ready to show).
 */
export function toDictionary(rows, lang) {
  const out = {};
  for (const r of rows) {
    const t = (r[lang] ?? "").trim();
    const status = (r[`${lang}_status`] ?? "").trim().toLowerCase();
    if (r.english && t && status !== "hold") out[r.english] = t;
  }
  return out;
}
