// S12-12 gap-check: local Windows Lighthouse runs proved too noisy
// (chrome-launcher crashes, inconsistent LCP element between runs) to
// reliably diagnose the real CI LCP failure on /login and /signup —
// two rounds of locally-diagnosed fixes didn't move CI's number at
// all. This prints the actual LCP element + timing breakdown from the
// median ("representative") run per URL straight into the CI log, so
// the next failure gives real data from the environment the budget is
// actually measured against, instead of another guess.
import { readFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2] || ".lighthouseci";
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const representative = manifest.filter((entry) => entry.isRepresentativeRun);

for (const entry of representative) {
  const lhr = JSON.parse(readFileSync(entry.jsonPath, "utf8"));
  console.log(`\n=== ${entry.url} ===`);
  console.log("Performance score:", lhr.categories.performance?.score);

  const lcp = lhr.audits["largest-contentful-paint"];
  console.log("LCP:", lcp?.numericValue, "ms");

  const lcpElement = lhr.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.node;
  console.log("LCP element:", lcpElement?.nodeLabel, "|", lcpElement?.selector);

  const phases = lhr.audits["largest-contentful-paint-element"]?.details?.items?.[1]?.items;
  console.log("LCP phases:", JSON.stringify(phases));

  const mainThread = lhr.audits["mainthread-work-breakdown"]?.details?.items;
  console.log("Main-thread breakdown:", JSON.stringify(mainThread));

  const bootup = lhr.audits["bootup-time"]?.details?.items?.slice(0, 6);
  console.log("Bootup time (top scripts):", JSON.stringify(bootup));

  const renderBlocking = lhr.audits["render-blocking-resources"]?.details?.items;
  console.log("Render-blocking resources:", JSON.stringify(renderBlocking));

  const ttfb = lhr.audits["server-response-time"]?.numericValue;
  console.log("Server response time (TTFB):", ttfb, "ms");

  const netRequests = lhr.audits["network-requests"]?.details?.items || [];
  const topByEnd = [...netRequests].sort((a, b) => (b.networkEndTime ?? 0) - (a.networkEndTime ?? 0)).slice(0, 8);
  console.log(
    "Latest-finishing requests:",
    JSON.stringify(topByEnd.map((r) => ({ url: r.url, end: r.networkEndTime, size: r.transferSize, priority: r.priority })))
  );
}
