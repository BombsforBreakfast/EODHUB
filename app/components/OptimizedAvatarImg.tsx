"use client";

import { avatarImageUrl } from "../lib/storageImageUrl";

type Props = {
  photoUrl: string | null | undefined;
  displayName: string;
  sizePx: number;
  className?: string;
  style?: React.CSSProperties;
  objectFit?: "cover" | "contain";
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
};

/** Profile photo for small display sizes. Uploads are pre-resized; avoid runtime Storage transforms. */
export default function OptimizedAvatarImg({
  photoUrl,
  displayName,
  sizePx,
  className,
  style,
  objectFit = "cover",
  loading = "lazy",
  fetchPriority = "auto",
}: Props) {
  if (!photoUrl) return null;

  const src = avatarImageUrl(photoUrl, sizePx) ?? photoUrl;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase public URLs are user-managed content
    <img
      src={src}
      alt={displayName}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      style={{
        width: "100%",
        height: "100%",
        objectFit,
        display: "block",
        ...style,
      }}
    />
  );
}
