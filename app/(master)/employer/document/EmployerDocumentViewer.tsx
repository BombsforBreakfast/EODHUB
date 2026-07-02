"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  candidateDocumentApiHref,
  type CandidateDocumentKind,
} from "../lib/candidateDocumentLinks";
import { openDocumentLink } from "@/app/lib/native/nativeFileOpen";
import CandidateDocumentPreview from "../components/CandidateDocumentPreview";

function parseKind(value: string | null): CandidateDocumentKind | null {
  if (value === "resume" || value === "education" || value === "training") return value;
  return null;
}

function kindLabel(kind: CandidateDocumentKind): string {
  if (kind === "resume") return "Resume";
  if (kind === "education") return "Education document";
  return "Training document";
}

export default function EmployerDocumentViewer() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const kind = parseKind(searchParams.get("kind"));
  const tag = searchParams.get("tag");

  const downloadHref = useMemo(() => {
    if (!userId || !kind) return null;
    return candidateDocumentApiHref(userId, kind, tag ?? undefined, "download");
  }, [userId, kind, tag]);

  if (!userId || !kind) {
    return (
      <ViewerShell title="Document">
        <MessagePanel message="Missing document request." />
      </ViewerShell>
    );
  }

  const title = kindLabel(kind);

  return (
    <ViewerShell title={title} downloadHref={downloadHref}>
      <CandidateDocumentPreview
        userId={userId}
        kind={kind}
        tag={tag ?? undefined}
        minHeight="100%"
      />
    </ViewerShell>
  );
}

function ViewerShell({
  title,
  downloadHref,
  children,
}: {
  title: string;
  downloadHref?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#111",
        color: "#f3f4f6",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          background: "#0f0f0f",
        }}
      >
        <Link
          href="/employer"
          style={{ color: "#93c5fd", textDecoration: "none", fontSize: 14, fontWeight: 600, flexShrink: 0 }}
        >
          ← Back
        </Link>
        <div
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {downloadHref ? (
          <a
            href={downloadHref}
            onClick={(event) => {
              void openDocumentLink(event, downloadHref);
            }}
            style={{ color: "#9ca3af", textDecoration: "none", fontSize: 12, fontWeight: 500, flexShrink: 0 }}
          >
            Save copy
          </a>
        ) : null}
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
    </div>
  );
}

function MessagePanel({ message }: { message: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{message}</p>
      <Link href="/employer" style={{ color: "#93c5fd", fontSize: 13, textDecoration: "none" }}>
        Return to employer dashboard
      </Link>
    </div>
  );
}
