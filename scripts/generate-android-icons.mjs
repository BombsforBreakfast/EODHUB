/** Reuse the approved app icon for Android launchers. Writes Android resources only. */
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android/app/src/main/res");
const source = await readFile(join(root, "ios-assets/app-icon-1024.png"));
const background = { r: 10, g: 10, b: 10, alpha: 1 };
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// Separate the white wordmark from its dark canvas for adaptive launcher masks.
for (let offset = 0; offset < data.length; offset += 4) {
  const coverage = Math.max(0, Math.min(255, Math.round((data[offset] - 10) * 255 / 245)));
  data[offset] = data[offset + 1] = data[offset + 2] = 255;
  data[offset + 3] = coverage;
}
const mark = await sharp(data, { raw: info }).trim().png().toBuffer();
const dimensions = await sharp(mark).metadata();
// Keep every corner of the wordmark inside Android's central 66dp safe circle.
const scale = 64 / Math.hypot(dimensions.width, dimensions.height);
const targets = [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]];
for (const [density, multiplier] of targets) {
  const directory = join(res, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  const legacySize = Math.round(48 * multiplier);
  const legacy = await sharp(source).resize(legacySize, legacySize).flatten({ background }).png().toBuffer();
  await writeFile(join(directory, "ic_launcher.png"), legacy);
  const mask = Buffer.from(`<svg width="${legacySize}" height="${legacySize}"><circle cx="${legacySize / 2}" cy="${legacySize / 2}" r="${legacySize / 2}" fill="white"/></svg>`);
  await writeFile(join(directory, "ic_launcher_round.png"), await sharp(legacy).ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer());
  const canvas = Math.round(108 * multiplier);
  const fitted = await sharp(mark).resize(Math.round(dimensions.width * scale * multiplier),
    Math.round(dimensions.height * scale * multiplier)).png().toBuffer();
  await writeFile(join(directory, "ic_launcher_foreground.png"), await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: fitted, gravity: "centre" }]).png().toBuffer());
}
await writeFile(join(res, "values/ic_launcher_background.xml"),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0a0a0a</color>\n</resources>\n');
console.log("Generated EOD-HUB Android launcher icons in all five densities; iOS assets unchanged.");
