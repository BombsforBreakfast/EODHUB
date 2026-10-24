import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isNativeApp } from "../app/lib/native/isNativeApp";

function main() {
  const root = new URL("../", import.meta.url);
  for (const path of [
    "app/lib/rentals/owner-phones.server.ts",
    "app/lib/rentals/useRentalMemberAccess.ts",
    "app/api/rentals/owner-contacts/route.ts",
  ]) {
    assert.equal(existsSync(new URL(path, root)), false, `Retired rental member contact source: ${path}`);
  }
  const directory = readFileSync(new URL("app/promote/rentals/RentalDirectory.tsx", root), "utf8");
  assert.doesNotMatch(directory, /MasterShell|useAuth|useRentalMemberAccess|phoneContent|personal number|LockKeyhole|309.251.5531/);
  assert.match(directory, /data-rental-experience="public"/);
  assert.match(directory, /For calls, contact/);
  const chatHost = readFileSync(new URL("app/components/ChatroomPeekSheetHost.tsx", root), "utf8");
  assert.match(chatHost, /if \(isRentalPage\) return null/);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    assert.equal(isNativeApp(), false);
    for (const userAgent of ["Mozilla/5.0 (iPhone) Safari", "Mozilla/5.0 (Linux; Android) Chrome"]) {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { navigator: { userAgent } } });
      assert.equal(isNativeApp(), false);
    }
    Object.defineProperty(globalThis, "window", {
      configurable: true, value: { Capacitor: { isNativePlatform: () => true }, navigator: { userAgent: "iPhone" } },
    });
    assert.equal(isNativeApp(), true);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { navigator: { userAgent: "Android Capacitor" } } });
    assert.equal(isNativeApp(), true);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
  console.log("Rental access checks passed: standalone public experience, retired personal contact source/API, no member shell/chat, mobile browsers, and native platform detection.");
}

main();
