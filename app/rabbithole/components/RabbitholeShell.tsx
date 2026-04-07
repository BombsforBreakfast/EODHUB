import Link from "next/link";

export default function RabbitholeShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const showPageHeading = title !== "Rabbithole";

  return (
    <main style={{ maxWidth: 1024, margin: "0 auto", padding: "24px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
          EOD Hub Library Layer
        </div>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/rabbithole"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            textDecoration: "none",
            color: "inherit",
            minWidth: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static mascot asset */}
            <img
              src="/rabbithole-mascot.png"
              alt=""
              width={44}
              height={44}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                objectFit: "cover",
                flexShrink: 0,
                border: "1px solid #334155",
              }}
            />
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Rabbithole</span>
          </Link>
          <Link href="/rabbithole/new" style={actionLink(true)}>
            New Thread
          </Link>
        </div>
        {showPageHeading && <h1 style={{ margin: "10px 0 8px", fontSize: 34, fontWeight: 800 }}>{title}</h1>}
        {description && (
          <p style={{ margin: 0, marginTop: showPageHeading ? 0 : 10, color: "#94a3b8", maxWidth: 760 }}>{description}</p>
        )}
      </header>
      {children}
    </main>
  );
}

function actionLink(primary: boolean): React.CSSProperties {
  return {
    textDecoration: "none",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "8px 12px",
    color: primary ? "#0b1220" : "#e2e8f0",
    background: primary ? "#facc15" : "transparent",
    fontWeight: 700,
    flexShrink: 0,
  };
}
