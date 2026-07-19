/** Client-safe helpers for arcade preview / launch visibility. */

import { isNativeIosApp } from "./native/isNativeApp";

/** Sent on arcade access API calls so the server can unlock native iOS without the web password gate. */
export const EOD_NATIVE_PLATFORM_HEADER = "x-eod-native-platform";

/**
 * Nav: founder can always click (web preview).
 * Native iOS app: arcade is live for TestFlight / App Store staggered launch.
 * Website (non-founder): stays Coming Soon.
 */
export function canClickArcadeNav(isFounder: boolean): boolean {
  if (isFounder) return true;
  return isNativeIosApp();
}

/** True when this client should request native-iOS public arcade access from the API. */
export function shouldRequestNativeIosArcadeAccess(): boolean {
  return isNativeIosApp();
}

export function nativeIosArcadeAccessHeaders(): Record<string, string> {
  if (!shouldRequestNativeIosArcadeAccess()) return {};
  return { [EOD_NATIVE_PLATFORM_HEADER]: "ios" };
}
