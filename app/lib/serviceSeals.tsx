import type { CSSProperties } from "react";
import { shouldShowUsServiceVisuals } from "./membershipCountries";

/**
 * Public seal assets live under /public/military-seals/ and are keyed by the exact
 * `profiles.service` string stored in the database. If a value has no file here, the UI
 * shows the service text instead (e.g. Civil Service, LEO/FED when added later).
 *
 * US crests are only shown for US (or legacy unknown-country) members. Non-US members
 * keep the service label as text until country-specific crests exist.
 */
const SERVICE_SEAL_PATHS: Record<string, string> = {
  Army: "/military-seals/army.png",
  Navy: "/military-seals/navy.png",
  Marines: "/military-seals/marines.png",
  "Air Force": "/military-seals/air-force.png",
};

export function getServiceSealPublicPath(
  service: string | null | undefined,
  country?: string | null,
): string | null {
  if (!service?.trim()) return null;
  if (!shouldShowUsServiceVisuals(country)) return null;
  return SERVICE_SEAL_PATHS[service] ?? null;
}

type ServiceSealValueProps = {
  service: string | null | undefined;
  /** Membership country (ISO). Non-US → text only, no US crest. */
  country?: string | null;
  notSetLabel?: string;
  /** Display size in px (width & height). */
  size?: number;
  style?: CSSProperties;
};

/**
 * Renders a branch seal when we have an image for the DB `service` value and the
 * member is US (or country unknown); otherwise the raw service string, or
 * `notSetLabel` when service is empty.
 */
export function ServiceSealValue({
  service,
  country,
  notSetLabel = "Not added yet",
  size = 44,
  style,
}: ServiceSealValueProps) {
  const path = getServiceSealPublicPath(service, country);
  if (!service?.trim()) {
    return <span>{notSetLabel}</span>;
  }
  if (path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small decorative seal; no remote optimization
      <img
        src={path}
        alt={service}
        title={service}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          borderRadius: "50%",
          display: "inline-block",
          verticalAlign: "middle",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.2)",
          ...style,
        }}
      />
    );
  }
  return <span>{service}</span>;
}
