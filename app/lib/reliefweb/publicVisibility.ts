type ReliefWebImportMeta = {
  suppressed?: boolean;
  relevance_confidence?: "high" | "possible" | "low";
} | null | undefined;

export function isReliefWebJobSuppressed(
  sourceType: string | null | undefined,
  importMetadata: ReliefWebImportMeta
): boolean {
  void sourceType; void importMetadata;
  return false;
}

export function reliefWebConfidenceBadge(confidence: string | undefined): {
  label: string;
  bg: string;
  color: string;
} {
  switch (confidence) {
    case "high":
      return { label: "HIGH", bg: "#dcfce7", color: "#15803d" };
    case "possible":
      return { label: "POSSIBLE", bg: "#fef9c3", color: "#854d0e" };
    default:
      return { label: "LOW", bg: "#fee2e2", color: "#b91c1c" };
  }
}
