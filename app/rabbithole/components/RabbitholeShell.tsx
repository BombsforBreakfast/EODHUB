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
  return (
    <main style={{ maxWidth: 1024, margin: "0 auto", padding: "24px 16px 48px" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
          EOD Hub Library Layer
        </div>
        <h1 style={{ margin: "6px 0 8px", fontSize: 34, fontWeight: 800 }}>{title}</h1>
        {description && <p style={{ margin: 0, color: "#94a3b8", maxWidth: 760 }}>{description}</p>}
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/rabbithole" style={actionLink(false)}>
            Rabbithole Home
          </Link>
          <Link href="/rabbithole/new" style={actionLink(true)}>
            New Thread
          </Link>
        </div>
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
  };
}
