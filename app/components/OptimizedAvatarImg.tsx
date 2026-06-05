"use client";

import { avatarImageUrl } from "../lib/storageImageUrl";

type Props = {
  photoUrl: string | null | undefined;
  displayName: string;
  sizePx: number;
  className?: string;
  style?: React.CSSProperties;
  objectFit?: "cover" | "contain";
};

/** Optimized profile photo for small display sizes (uses Supabase image transforms). */
export default function OptimizedAvatarImg({
  photoUrl,
  displayName,
  sizePx,
  className,
  style,
  objectFit = "cover",
}: Props) {
  if (!photoUrl) return null;

  const src = avatarImageUrl(photoUrl, sizePx) ?? photoUrl;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase transform URLs are dynamic
    <img
      src={src}
      alt={displayName}
      className={className}
      loading="lazy"
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
