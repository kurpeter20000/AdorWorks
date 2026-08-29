#!/usr/bin/env node
/*
  Local-only asset prep for the public site's photography. Run this once
  per source photo, commit only what it writes to ../img/photos/ -- the
  site itself has no build step and stays that way; this is a developer
  tool, not part of the deploy.

  Usage:
    npm run optimize -- <source-file> <output-name> [--widths=480,960,1440] [--quality=80]

  Example:
    npm run optimize -- ~/Downloads/team-photo.jpg home-hero
    -> ../img/photos/home-hero-480.webp + .jpg
       ../img/photos/home-hero-960.webp + .jpg
       ../img/photos/home-hero-1440.webp + .jpg

  Budgets (warned, not enforced -- a human should decide whether a
  warning is acceptable for a specific hero vs card image):
    hero-sized (width >= 960): warn above 150KB per file
    card-sized (width < 960): warn above 60KB per file
*/
import sharp from "sharp";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../img/photos");

function parseArgs(argv) {
  const positional = [];
  let widths = [480, 960, 1440];
  let quality = 80;
  for (const arg of argv) {
    if (arg.startsWith("--widths=")) {
      widths = arg
        .slice("--widths=".length)
        .split(",")
        .map((w) => Number(w.trim()))
        .filter((w) => Number.isFinite(w) && w > 0);
    } else if (arg.startsWith("--quality=")) {
      quality = Number(arg.slice("--quality=".length));
    } else {
      positional.push(arg);
    }
  }
  return { source: positional[0], outputName: positional[1], widths, quality };
}

function formatKb(bytes) {
  return (bytes / 1024).toFixed(1) + "KB";
}

async function main() {
  const { source, outputName, widths, quality } = parseArgs(process.argv.slice(2));

  if (!source || !outputName) {
    console.error("Usage: npm run optimize -- <source-file> <output-name> [--widths=480,960,1440] [--quality=80]");
    process.exit(1);
  }
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath)) {
    console.error(`Source file not found: ${sourcePath}`);
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(outputName)) {
    console.error("output-name must be lowercase-and-hyphens only (used directly in a public URL).");
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const image = sharp(sourcePath);
  const meta = await image.metadata();
  console.log(`Source: ${sourcePath} (${meta.width}x${meta.height}, ${formatKb(statSync(sourcePath).size)})`);
  console.log(`Note: metadata (EXIF/GPS) is stripped automatically -- sharp does not copy it unless asked to.\n`);

  const sources = [];
  for (const width of widths) {
    if (meta.width && width > meta.width) {
      console.log(`Skipping ${width}px -- wider than the source image (${meta.width}px). Never upscale.`);
      continue;
    }
    const budget = width >= 960 ? 150 * 1024 : 60 * 1024;

    const webpPath = join(OUTPUT_DIR, `${outputName}-${width}.webp`);
    const webpInfo = await sharp(sourcePath).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(webpPath);

    const jpgPath = join(OUTPUT_DIR, `${outputName}-${width}.jpg`);
    const jpgInfo = await sharp(sourcePath)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toFile(jpgPath);

    for (const [path, info] of [[webpPath, webpInfo], [jpgPath, jpgInfo]]) {
      const overBudget = info.size > budget ? "  ⚠ over budget" : "";
      console.log(`  ${path.replace(resolve(__dirname, "..") + "/", "")} — ${formatKb(info.size)}${overBudget}`);
    }
    sources.push({ width, webp: `img/photos/${outputName}-${width}.webp`, jpg: `img/photos/${outputName}-${width}.jpg` });
  }

  if (sources.length === 0) {
    console.error("\nNo output produced -- every requested width was larger than the source image.");
    process.exit(1);
  }

  const largest = sources[sources.length - 1];
  const srcsetWebp = sources.map((s) => `${s.webp} ${s.width}w`).join(", ");
  const srcsetJpg = sources.map((s) => `${s.jpg} ${s.width}w`).join(", ");

  console.log("\nSuggested markup (adjust sizes= for where this actually renders):\n");
  console.log(`<picture>
  <source type="image/webp" srcset="${srcsetWebp}" sizes="100vw">
  <img src="${largest.jpg}" srcset="${srcsetJpg}" sizes="100vw"
       width="${largest.width}" height="ADD_HEIGHT" alt="ADD_ALT_TEXT" loading="lazy">
</picture>`);
  console.log("\nFor the single above-the-fold hero image on a page, drop loading=\"lazy\" (or use fetchpriority=\"high\") instead.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
