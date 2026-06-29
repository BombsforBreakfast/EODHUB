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

export function candidateDocumentMetaHref(
  userId: string,
  kind: CandidateDocumentKind,
  tag?: string,
): string {
  const params = new URLSearchParams({ userId, kind, meta: "1" });
  if (tag) params.set("tag", tag);
  return `/api/employer/candidate-document?${params.toString()}`;
}

export function documentExtension(filename: string): string {
  const clean = filename.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return "";
  return clean.slice(dot + 1).toLowerCase();
}
