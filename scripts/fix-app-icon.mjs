import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Square canvas — iOS applies its own superellipse mask; corners must be sharp in the PNG.
const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0a0a0a"/>
  <text x="512" y="430" text-anchor="middle" fill="#ffffff" font-family="Arial Black, Impact, Helvetica Neue, sans-serif" font-weight="900" font-size="248" letter-spacing="-8">EOD</text>
  <text x="512" y="690" text-anchor="middle" fill="#ffffff" font-family="Arial Black, Impact, Helvetica Neue, sans-serif" font-weight="900" font-size="248" letter-spacing="-8">HUB</text>
</svg>`;

const rendered = await sharp(Buffer.from(svg)).png().toBuffer();

const png = await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 3,
    background: { r: 10, g: 10, b: 10 },
  },
})
  .composite([{ input: rendered, top: 0, left: 0 }])
  .png()
  .toBuffer();

const paths = [
  join(root, "ios-assets", "app-icon-1024.png"),
  join(
    root,
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  ),
];

for (const p of paths) {
  writeFileSync(p, png);
  console.log("Wrote", p);
}
