import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const BRAND_BG = "#0a0a0a";

function splashSvg(width, height) {
  const scale = Math.min(width, height) / 1024;
  const fontSize = Math.max(72, Math.round(248 * scale));
  const letterSpacing = Math.round(-8 * scale);
  const centerY = height / 2;
  const lineGap = fontSize * 0.52;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${BRAND_BG}"/>
  <text x="${width / 2}" y="${centerY - lineGap}" text-anchor="middle" fill="#ffffff" font-family="Arial Black, Impact, Helvetica Neue, sans-serif" font-weight="900" font-size="${fontSize}" letter-spacing="${letterSpacing}">EOD</text>
  <text x="${width / 2}" y="${centerY + lineGap}" text-anchor="middle" fill="#ffffff" font-family="Arial Black, Impact, Helvetica Neue, sans-serif" font-weight="900" font-size="${fontSize}" letter-spacing="${letterSpacing}">HUB</text>
</svg>`;
}

async function writeSplash(path, width, height) {
  const png = await sharp(Buffer.from(splashSvg(width, height))).png().toBuffer();
  writeFileSync(path, png);
  console.log(`Wrote ${path} (${width}x${height})`);
}

const androidTargets = [
  ["android/app/src/main/res/drawable/splash.png", 480, 320],
  ["android/app/src/main/res/drawable-port-mdpi/splash.png", 320, 480],
  ["android/app/src/main/res/drawable-port-hdpi/splash.png", 480, 800],
  ["android/app/src/main/res/drawable-port-xhdpi/splash.png", 720, 1280],
  ["android/app/src/main/res/drawable-port-xxhdpi/splash.png", 960, 1600],
  ["android/app/src/main/res/drawable-port-xxxhdpi/splash.png", 1280, 1920],
  ["android/app/src/main/res/drawable-land-mdpi/splash.png", 480, 320],
  ["android/app/src/main/res/drawable-land-hdpi/splash.png", 800, 480],
  ["android/app/src/main/res/drawable-land-xhdpi/splash.png", 1280, 720],
  ["android/app/src/main/res/drawable-land-xxhdpi/splash.png", 1600, 960],
  ["android/app/src/main/res/drawable-land-xxxhdpi/splash.png", 1920, 1280],
];

const iosTargets = [
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png",
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png",
  "ios-assets/splash-2732x2732.png",
];

for (const [rel, width, height] of androidTargets) {
  await writeSplash(join(root, rel), width, height);
}

for (const rel of iosTargets) {
  await writeSplash(join(root, rel), 2732, 2732);
}
