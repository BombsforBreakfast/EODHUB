"use client";

import type { PostAsMode } from "@/app/lib/postAsIdentity";

type Props = {
  mode: PostAsMode;
  onChange: (mode: PostAsMode) => void;
  selfLabel: string;
  selfPhotoUrl: string | null;
  adminLabel: string;
  adminPhotoUrl: string | null;
  disabled?: boolean;
};

function avatarThumb(photoUrl: string | null, label: string) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#374151",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 800,
        color: "white",
        flexShrink: 0,
      }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        label[0]?.toUpperCase() ?? "?"
      )}
    </span>
  );
}

export default function PostAsSelector({
  mode,
  onChange,
  selfLabel,
  selfPhotoUrl,
  adminLabel,
  adminPhotoUrl,
  disabled = false,
}: Props) {
  const options: Array<{ id: PostAsMode; label: string; photoUrl: string | null }> = [
    { id: "self", label: selfLabel, photoUrl: selfPhotoUrl },
    { id: "admin", label: adminLabel, photoUrl: adminPhotoUrl },
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "inherit", opacity: 0.75 }}>Post as</span>
      {options.map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              border: active ? "2px solid #6366f1" : "1px solid rgba(127,127,127,0.35)",
              background: active ? "rgba(99,102,241,0.12)" : "transparent",
              color: "inherit",
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: active ? 800 : 650,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.65 : 1,
            }}
          >
            {avatarThumb(opt.photoUrl, opt.label)}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
