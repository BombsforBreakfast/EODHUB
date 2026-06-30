"use client";

import { isNativeApp } from "./isNativeApp";

export type NativeShareOptions = {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
};

export async function shareOrCopyUrl(options: NativeShareOptions): Promise<"shared" | "copied"> {
  const url = options.url ?? "";
  const text = options.text ?? "";

  if (isNativeApp()) {
    const { Share } = await import("@capacitor/share");
    const canShare = await Share.canShare().catch(() => ({ value: false }));
    if (canShare.value) {
      await Share.share(options);
      return "shared";
    }
  }

  const { writeClipboardText } = await import("./nativeClipboard");
  await writeClipboardText(url || text, options.title);
  return "copied";
}
