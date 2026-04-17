/**
 * Shown during client navigations between (master) routes — instant feedback while the next page chunk loads.
 * Keep this minimal so transitions feel snappy.
 */
export default function MasterSegmentLoading() {
  return (
    <div
      className="master-shell-main"
      style={{
        minWidth: 0,
        width: "100%",
        padding: "12px 0 24px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
      aria-busy
      aria-label="Loading"
    >
      <div
        style={{
          height: 10,
          maxWidth: 280,
          borderRadius: 8,
          background: "var(--background)",
          opacity: 0.45,
          boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.2)",
        }}
      />
      <div
        style={{
          height: 120,
          borderRadius: 14,
          background: "var(--background)",
          opacity: 0.35,
          boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.15)",
        }}
      />
      <div
        style={{
          height: 120,
          borderRadius: 14,
          background: "var(--background)",
          opacity: 0.35,
          boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.15)",
        }}
      />
    </div>
  );
}
