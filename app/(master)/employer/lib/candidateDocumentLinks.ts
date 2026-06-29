export type CandidateDocumentKind = "resume" | "education" | "training";

export function candidateDocumentViewHref(
  userId: string,
  kind: CandidateDocumentKind,
  tag?: string,
): string {
  const params = new URLSearchParams({ userId, kind });
  if (tag) params.set("tag", tag);
  return `/employer/document?${params.toString()}`;
}

export function candidateDocumentApiHref(
  userId: string,
  kind: CandidateDocumentKind,
  tag?: string,
  mode?: "inline" | "download",
): string {
  const params = new URLSearchParams({ userId, kind });
  if (tag) params.set("tag", tag);
  if (mode) params.set("mode", mode);
  return `/api/employer/candidate-document?${params.toString()}`;
}

export function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  return quotedMatch?.[1] ?? null;
}

export function isPdfDocument(contentType: string, filename: string): boolean {
  if (contentType.toLowerCase().includes("pdf")) return true;
  return filename.toLowerCase().endsWith(".pdf");
}
