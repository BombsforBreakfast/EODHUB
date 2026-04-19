"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RabbitholeAsset } from "./types";

export const RABBITHOLE_STORAGE_PROVIDER = "supabase" as const;
export const RABBITHOLE_BUCKET = "rabbithole-assets";

export type RabbitholeStorageLocator = {
  storageProvider: typeof RABBITHOLE_STORAGE_PROVIDER;
  bucket: string;
  objectKey: string;
};

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim().toLowerCase();
  const clean = trimmed.replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean || "asset.bin";
}

export function buildRabbitholeObjectKey(input: {
  contributionId: string;
  uploaderUserId: string;
  originalFilename: string;
  now?: Date;
}): string {
  const stamp = (input.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const name = sanitizeFilename(input.originalFilename);
  return `contributions/${input.contributionId}/${input.uploaderUserId}/${stamp}-${name}`;
}

export async function uploadRabbitholeAsset(
  supabase: SupabaseClient,
  input: {
    file: File;
    contributionId: string;
    uploaderUserId: string;
  },
): Promise<{ ok: true; locator: RabbitholeStorageLocator } | { ok: false; error: string }> {
  const objectKey = buildRabbitholeObjectKey({
    contributionId: input.contributionId,
    uploaderUserId: input.uploaderUserId,
    originalFilename: input.file.name,
  });

  const { error } = await supabase.storage.from(RABBITHOLE_BUCKET).upload(objectKey, input.file, {
    upsert: false,
    contentType: input.file.type || undefined,
  });

  if (error) return { ok: false, error: error.message || "Upload failed." };

  return {
    ok: true,
    locator: {
      storageProvider: RABBITHOLE_STORAGE_PROVIDER,
      bucket: RABBITHOLE_BUCKET,
      objectKey,
    },
  };
}

export async function resolveRabbitholeAssetUrl(
  supabase: SupabaseClient,
  asset: Pick<RabbitholeAsset, "accessLevel" | "bucket" | "objectKey">,
  options?: { signedUrlTtlSec?: number },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (asset.accessLevel === "public") {
    const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.objectKey);
    if (!data?.publicUrl) return { ok: false, error: "Could not resolve public URL." };
    return { ok: true, url: data.publicUrl };
  }

  const { data, error } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.objectKey, options?.signedUrlTtlSec ?? 1800);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message || "Could not create signed URL." };
  }
  return { ok: true, url: data.signedUrl };
}
