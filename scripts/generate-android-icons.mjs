import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
const bg = process.env.ANDROID_ICON_BACKGROUND || "#0a0a0a";
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(densities)) {
  const dir = join(root, "android/app/src/main/res", `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  const legacy = await sharp(source).resize(Math.round(48 * scale), Math.round(48 * scale)).png().toBuffer();
  for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) writeFileSync(join(dir, name), legacy);
  const canvas = Math.round(108 * scale);
  // Keep all artwork inside Android's 66dp adaptive-icon safe zone.
  const art = await sharp(source).resize(Math.round(66 * scale), Math.round(66 * scale)).png().toBuffer();
  const foreground = await sharp({ create: { width: canvas, height: canvas, channels: 4, background: bg } })
    .composite([{ input: art, gravity: "centre" }]).png().toBuffer();
  writeFileSync(join(dir, "ic_launcher_foreground.png"), foreground);
}
const res = join(root, "android/app/src/main/res");
writeFileSync(join(res, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${bg}</color></resources>\n`);
writeFileSync(join(res, "drawable/ic_launcher_background.xml"), '<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="@color/ic_launcher_background"/></shape>\n');
writeFileSync(join(res, "drawable-v24/ic_launcher_foreground.xml"), '<?xml version="1.0" encoding="utf-8"?>\n<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@mipmap/ic_launcher_foreground" android:gravity="center"/>\n');
console.log("Generated branded Android launcher icons at every density.");
