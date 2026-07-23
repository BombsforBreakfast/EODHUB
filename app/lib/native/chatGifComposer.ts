import { isNativeApp } from "@/app/lib/native/isNativeApp";

/**
 * Chat GIF composer (Team Room + Sidebar drawer).
 * Temporarily hidden inside Capacitor until the next native store build ships;
 * web gets the picker immediately after deploy.
 */
export function isChatGifComposerEnabled(): boolean {
  return !isNativeApp();
}
