// Small helper for scripted exact-text edits that keep each file's own
// line endings (some files here are CRLF, some LF). Fails loudly when an
// expected snippet isn't found, so a partial edit never goes unnoticed.
//
//   import { edit } from "./replace.mjs";
//   edit("path/file.tsx", [["old", "new"], ...]);
import { readFileSync, writeFileSync } from "node:fs";

export function edit(file, pairs, { all = false } = {}) {
  const raw = readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw new Error(`${file}: not found:\n${from}`);
    s = all ? s.split(from).join(to) : s.replace(from, () => to);
  }
  writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s);
}
