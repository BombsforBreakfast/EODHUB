"use client";

import { useTheme } from "../../lib/ThemeContext";
import { HOME_PARTNERS } from "../../lib/homePartners";

export default function ProudPartnersSection() {
  const { t } = useTheme();

  if (HOME_PARTNERS.length === 0) return null;

  return (
    <section
      aria-label="Proud partners"
      style={{
        marginTop: 22,
        padding: "8px 0 4px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: t.textMuted,
        }}
      >
        Proud Partners
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 20,
          marginTop: 16,
        }}
      >
        {HOME_PARTNERS.map((partner) => {
          const logo = (
            // eslint-disable-next-line @next/next/no-img-element -- static public partner branding
            <img
              src={partner.logoSrc}
              alt={partner.name}
              style={{
                display: "block",
                width: "auto",
                maxWidth: 160,
                maxHeight: 120,
                objectFit: "contain",
              }}
            />
          );

          return (
            <div
              key={partner.name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {partner.href ? (
                <a
                  href={partner.href}
                  target="_blank"
                  rel="noreferrer"
                  title={partner.name}
                  style={{ display: "block", lineHeight: 0 }}
                >
                  {logo}
                </a>
              ) : (
                logo
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
