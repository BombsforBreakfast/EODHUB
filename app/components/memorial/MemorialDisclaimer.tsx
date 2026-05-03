"use client";

import type { CSSProperties } from "react";
import type { MemorialCategory } from "./memorialModalShared";

const EODWF_HOME = "https://eod-wf.org/";
const EODWF_DIGITAL_WALL = "https://eod-wf.org/virtual-memorial";
const BTMF_HOME = "https://bombtechmemorial.org/";

function memorialSourceHref(url: string | null | undefined): string | null {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : null;
}

const linkBase: CSSProperties = {
  fontWeight: 700,
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

type Props = {
  category: MemorialCategory;
  sourceUrl?: string | null;
  /** Memorial accent color so links stay readable on tinted footers. */
  linkColor: string;
};

/**
 * Attribution footer with outbound links: specific memorial page when `sourceUrl`
 * is stored, plus the foundation / digital-wall sites.
 */
export function MemorialDisclaimer({ category, sourceUrl, linkColor }: Props) {
  const specific = memorialSourceHref(sourceUrl);
  const lc = { ...linkBase, color: linkColor };

  if (category === "leo_fed") {
    const primaryHref = specific ?? BTMF_HOME;
    return (
      <span>
        * This information has been respectfully referenced from{" "}
        <a href={primaryHref} target="_blank" rel="noopener noreferrer" style={lc}>
          bombtechmemorial.org
        </a>
        .
      </span>
    );
  }

  const digitalWallHref = specific ?? EODWF_DIGITAL_WALL;

  return (
    <span>
      * This memorial is respectfully referenced from the{" "}
      <a href={digitalWallHref} target="_blank" rel="noopener noreferrer" style={lc}>
        EOD Warrior Foundation Digital Wall
      </a>
      . If anything appears inaccurate, please contact our admin or connect directly with{" "}
      <a href={EODWF_HOME} target="_blank" rel="noopener noreferrer" style={lc}>
        EODWF
      </a>{" "}
      through their website.
    </span>
  );
}
