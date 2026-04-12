"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { useTheme } from "../lib/ThemeContext";

type Variant = "login" | "navDesktop" | "navMobile";

const VARIANT = {
  login: {
    width: 518,
    height: 324,
    sizes: "(max-width: 500px) 85vw, 300px",
    img: { width: "100%", maxWidth: 300, height: "auto", display: "block" } satisfies CSSProperties,
    pad: "0",
    radius: 0,
  },
  navDesktop: {
    width: 518,
    height: 324,
    sizes: "160px",
    img: { height: 45, width: "auto", display: "block" } satisfies CSSProperties,
    pad: "0",
    radius: 0,
  },
  navMobile: {
    width: 518,
    height: 324,
    sizes: "48px",
    img: { height: 28, width: "auto", display: "block" } satisfies CSSProperties,
    pad: "0",
    radius: 0,
  },
} satisfies Record<
  Variant,
  { width: number; height: number; sizes: string; img: CSSProperties; pad: string; radius: number }
>;

type Props = {
  variant: Variant;
  priority?: boolean;
  className?: string;
};

/**
 * White-background PNG: light mode uses multiply so #fff in the asset blends into t.bg (only black art remains visible);
 * dark mode inverts on a black tile → white line art. Transparent PNG would allow dropping multiply/invert later.
 */
export default function EodCrabLogo({ variant, priority, className }: Props) {
  const { t, isDark } = useTheme();
  const v = VARIANT[variant];

  return (
    <div
      className={className}
      style={{
        background: isDark ? "#000000" : t.bg,
        borderRadius: v.radius,
        padding: v.pad,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      <Image
        src="/branding/eod-crab-logo.png"
        alt={variant === "login" ? "EOD technician badges" : ""}
        width={v.width}
        height={v.height}
        sizes={v.sizes}
        priority={priority}
        style={{
          ...v.img,
          mixBlendMode: isDark ? undefined : "multiply",
          filter: isDark ? "invert(1) contrast(1.08)" : undefined,
        }}
      />
    </div>
  );
}
