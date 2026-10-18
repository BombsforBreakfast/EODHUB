/** Generate Android branding from the same PNG used by the login page. No iOS writes. */
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(root, "public/branding/eod-crab-logo.png"));
const bg = { r: 10, g: 10, b: 10, alpha: 1 };
// The source is black art on white. Invert exactly like the dark login logo;
// screen onto the dark canvas to blend its black background without a tile.
const logo = await sharp(source).negate({ alpha: false }).png().toBuffer();
const targets = [
  ["drawable", 480, 320],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
];
async function makeLogo(width, height, size) {
  const fitted = await sharp(logo).resize(size, size, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: bg } })
    .composite([{ input: fitted, gravity: "centre", blend: "screen" }]).png().toBuffer();
}
for (const [folder, width, height] of targets) {
  await writeFile(join(root, `android/app/src/main/res/${folder}/splash.png`),
    await makeLogo(width, height, Math.round(Math.min(width, height) * 0.65)));
}
// Android 12 masks the launch icon. Inset all artwork inside its central safe area.
const iconDir = join(root, "android/app/src/main/res/drawable-nodpi");
await mkdir(iconDir, { recursive: true });
await writeFile(join(iconDir, "eod_splash_logo.png"), await makeLogo(1152, 1152, 640));
console.log("Android splash PNGs generated; iOS assets unchanged.");
