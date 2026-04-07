import Link from "next/link";

type Step = {
  label: string;
  href?: string;
};

export default function BreadcrumbTrail({
  label,
  steps,
}: {
  label: string;
  steps: Step[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {steps.map((step, idx) => (
          <span key={`${step.label}-${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {step.href ? (
              <Link
                href={step.href}
                style={{
                  textDecoration: "none",
                  color: "#e2e8f0",
                  border: "1px solid #334155",
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: 13,
                }}
              >
                {step.label}
              </Link>
            ) : (
              <span style={{ color: "#e2e8f0", border: "1px solid #334155", borderRadius: 999, padding: "3px 10px", fontSize: 13 }}>
                {step.label}
              </span>
            )}
            {idx < steps.length - 1 && <span style={{ color: "#64748b" }}>/</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
