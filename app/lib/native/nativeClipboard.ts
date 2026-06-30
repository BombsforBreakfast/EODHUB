"use client";

import { isNativeApp } from "./isNativeApp";

export async function writeClipboardText(text: string, label?: string): Promise<void> {
  if (isNativeApp()) {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text, label });
    return;
  }

  await navigator.clipboard.writeText(text);
}
