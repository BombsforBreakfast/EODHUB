import NavBar from "../components/NavBar";

export default function GamesLayout({ children }: { children: React.ReactNode }) {
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
