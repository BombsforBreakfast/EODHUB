import { redirect } from "next/navigation";
import NavBar from "../components/NavBar";
import { PRODUCT_FEATURE_FLAGS } from "../lib/productFeatureFlags";

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  if (!PRODUCT_FEATURE_FLAGS.arcadeEnabled) {
    redirect("/");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        boxSizing: "border-box",
        color: "var(--foreground)",
        background: "var(--background)",
      }}
    >
      <div
        className="games-shell-nav"
        style={{
          width: "100%",
          maxWidth: 1800,
          margin: "0 auto",
          padding: "16px 20px 0",
          boxSizing: "border-box",
        }}
      >
        <NavBar />
      </div>
      {children}
    </div>
  );
}
