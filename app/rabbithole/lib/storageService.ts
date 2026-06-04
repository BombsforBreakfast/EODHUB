"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RabbitholeAsset } from "./types";
import { prepareDocumentUploadFile, prepareImageUploadFile } from "../../lib/prepareUploadFile";
import { isDocumentFile, isImageFile } from "../../lib/uploadLimits";

export const RABBITHOLE_STORAGE_PROVIDER = "supabase" as const;
export const RABBITHOLE_BUCKET = "rabbithole-assets";

export type RabbitholeStorageLocator = {
  storageProvider: typeof RABBITHOLE_STORAGE_PROVIDER;
  bucket: string;
  objectKey: string;
};

type AssetUrlResult = { ok: true; url: string } | { ok: false; error: string };
type ResolvableRabbitholeAsset = Pick<RabbitholeAsset, "accessLevel" | "bucket" | "objectKey">;

const SIGNED_URL_EXPIRY_BUFFER_MS = 60_000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function cacheKey(asset: Pick<RabbitholeAsset, "bucket" | "objectKey">): string {
  return `${asset.bucket}:${asset.objectKey}`;
}

function cachedSignedUrl(asset: Pick<RabbitholeAsset, "bucket" | "objectKey">): string | null {
  const cached = signedUrlCache.get(cacheKey(asset));
  if (!cached) return null;
  if (cached.expiresAt <= Date.now() + SIGNED_URL_EXPIRY_BUFFER_MS) {
    signedUrlCache.delete(cacheKey(asset));
    return null;
  }
  return cached.url;
}

function rememberSignedUrl(asset: Pick<RabbitholeAsset, "bucket" | "objectKey">, url: string, ttlSec: number) {
  signedUrlCache.set(cacheKey(asset), {
    url,
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

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
  const prepared = isDocumentFile(input.file)
    ? prepareDocumentUploadFile(input.file)
    : isImageFile(input.file)
      ? await prepareImageUploadFile(input.file)
      : { ok: false as const, error: `"${input.file.name}" is not a supported file type.` };
  if (!prepared.ok) return prepared;

  const file = prepared.file;
  const objectKey = buildRabbitholeObjectKey({
    contributionId: input.contributionId,
    uploaderUserId: input.uploaderUserId,
    originalFilename: file.name,
  });

  const { error } = await supabase.storage.from(RABBITHOLE_BUCKET).upload(objectKey, file, {
    upsert: false,
    contentType: file.type || undefined,
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
  asset: ResolvableRabbitholeAsset,
  options?: { signedUrlTtlSec?: number },
): Promise<AssetUrlResult> {
  if (asset.accessLevel === "public") {
    const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.objectKey);
    if (!data?.publicUrl) return { ok: false, error: "Could not resolve public URL." };
    return { ok: true, url: data.publicUrl };
  }

  const ttlSec = options?.signedUrlTtlSec ?? 1800;
  const cached = cachedSignedUrl(asset);
  if (cached) return { ok: true, url: cached };

  const { data, error } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.objectKey, ttlSec);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message || "Could not create signed URL." };
  }
  rememberSignedUrl(asset, data.signedUrl, ttlSec);
  return { ok: true, url: data.signedUrl };
}

export async function resolveRabbitholeAssetUrls(
  supabase: SupabaseClient,
  assets: ResolvableRabbitholeAsset[],
  options?: { signedUrlTtlSec?: number },
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const ttlSec = options?.signedUrlTtlSec ?? 1800;
  const privateByBucket = new Map<string, ResolvableRabbitholeAsset[]>();

  for (const asset of assets) {
    const key = cacheKey(asset);
    if (asset.accessLevel === "public") {
      const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.objectKey);
      if (data?.publicUrl) urls.set(key, data.publicUrl);
      continue;
    }

    const cached = cachedSignedUrl(asset);
    if (cached) {
      urls.set(key, cached);
      continue;
    }

    const bucketAssets = privateByBucket.get(asset.bucket) ?? [];
    bucketAssets.push(asset);
    privateByBucket.set(asset.bucket, bucketAssets);
  }

  await Promise.all(
    [...privateByBucket.entries()].map(async ([bucket, bucketAssets]) => {
      const paths = bucketAssets.map((asset) => asset.objectKey);
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, ttlSec);
      if (error || !data) return;
      data.forEach((item, index) => {
        if (!item.signedUrl) return;
        const asset = bucketAssets[index];
        urls.set(cacheKey(asset), item.signedUrl);
        rememberSignedUrl(asset, item.signedUrl, ttlSec);
      });
    }),
  );

  return urls;
}
