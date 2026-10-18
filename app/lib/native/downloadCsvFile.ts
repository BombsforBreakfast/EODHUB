"use client";

import { isNativeApp } from "./isNativeApp";

/** Native WebViews cannot reliably download blob links. Let the owner choose a
 * save/share destination using the already-installed Filesystem/Share plugins. */
export async function downloadCsvFile(filename: string, csv: string): Promise<boolean> {
  const text = csv.startsWith("\ufeff") ? csv : `\ufeff${csv}`;
  if (isNativeApp()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    if (!(await Share.canShare()).value) throw new Error("Saving or sharing files is unavailable on this device.");
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
    const { uri } = await Filesystem.writeFile({
      path: `eodhub/exports/${crypto.randomUUID()}/${safeName}`, data: text,
      directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true,
    });
    try {
      await Share.share({ title: filename, files: [uri], dialogTitle: "Save or share CSV" });
    } catch (error) {
      if (error instanceof Error && /cancel|dismiss|abort/i.test(error.message)) return false;
      throw error;
    }
    // The chosen app may still be reading the file after the share sheet closes.
    // Keep it in the app cache rather than deleting it underneath that app.
    return true;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
