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
  console.log("TBT:", lhr.audits["total-blocking-time"]?.numericValue, "ms");
  console.log("CLS:", lhr.audits["cumulative-layout-shift"]?.numericValue);

  // Structure varies by Lighthouse version/build — don't assume item[0]
  // is always the node table; scan every item for the first one that
  // actually looks like an element-table entry.
  const lcpDetailItems = lhr.audits["largest-contentful-paint-element"]?.details?.items ?? [];
  let lcpElement;
  let phases;
  for (const item of lcpDetailItems) {
    const node = item?.items?.[0]?.node;
    if (node) lcpElement = node;
    if (item?.items?.[0]?.phase) phases = item.items;
  }
  if (lcpElement) {
    console.log("LCP element:", lcpElement.nodeLabel, "|", lcpElement.selector, "|", lcpElement.snippet);
  } else {
    console.log("LCP element: could not extract — raw details:", JSON.stringify(lcpDetailItems));
  }
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

  const poster = netRequests.find((r) => r.url?.includes("hero-poster"));
  console.log("Poster request:", JSON.stringify(poster));

  const totalTransfer = netRequests.reduce((sum, r) => sum + (r.transferSize || 0), 0);
  console.log("Total requests:", netRequests.length, "| total transfer bytes:", totalTransfer);
}
