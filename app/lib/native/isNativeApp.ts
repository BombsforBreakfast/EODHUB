"use client";

/** True when running inside a Capacitor native shell (iOS/Android). */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return /Capacitor/i.test(window.navigator.userAgent);
}

/** True only inside the Android app, never an ordinary Android browser. */
export function isNativeAndroidApp(): boolean {
  if (!isNativeApp() || typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  return platform ? platform === "android" : /Android/i.test(window.navigator.userAgent);
}

/** True when running in the Capacitor iOS shell. */
export function isNativeIosApp(): boolean {
  if (!isNativeApp()) return false;
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  if (platform) return platform === "ios";
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}
