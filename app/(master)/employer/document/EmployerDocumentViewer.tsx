"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  candidateDocumentApiHref,
  isPdfDocument,
  parseFilenameFromContentDisposition,
  type CandidateDocumentKind,
} from "../lib/candidateDocumentLinks";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      blobUrl: string;
      contentType: string;
      filename: string;
      isPdf: boolean;
    };

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
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const openedPreviewRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);

  const apiHref = useMemo(() => {
    if (!userId || !kind) return null;
    return candidateDocumentApiHref(userId, kind, tag ?? undefined, "inline");
  }, [userId, kind, tag]);

  const downloadHref = useMemo(() => {
    if (!userId || !kind) return null;
    return candidateDocumentApiHref(userId, kind, tag ?? undefined, "download");
  }, [userId, kind, tag]);

  useEffect(() => {
    if (!apiHref) {
      setLoadState({ status: "error", message: "Missing document request." });
      return;
    }

    let cancelled = false;

    (async () => {
      setLoadState({ status: "loading" });
      try {
        const res = await fetch(apiHref, { credentials: "include" });
        if (!res.ok) {
          throw new Error(res.status === 403 ? "You do not have access to this document." : "Could not load document.");
        }
        const filename =
          parseFilenameFromContentDisposition(res.headers.get("content-disposition")) ??
          `${kind ?? "document"}-${userId}`;
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        const blob = await res.blob();
        if (cancelled) return;
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        setLoadState({
          status: "ready",
          blobUrl,
          contentType,
          filename,
          isPdf: isPdfDocument(contentType, filename),
        });
      } catch (err) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message: err instanceof Error ? err.message : "Could not load document.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiHref, kind, userId]);

  useEffect(() => {
    if (loadState.status !== "ready" || loadState.isPdf || openedPreviewRef.current) return;
    openedPreviewRef.current = true;
    window.location.assign(loadState.blobUrl);
  }, [loadState]);

  useEffect(() => {
    return () => {
      if (openedPreviewRef.current) return;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  if (!userId || !kind) {
    return (
      <ViewerShell title="Document">
        <MessagePanel message="Missing document request." backHref="/employer" />
      </ViewerShell>
    );
  }

  const title = loadState.status === "ready" ? loadState.filename : kindLabel(kind);

  return (
    <ViewerShell
      title={title}
      downloadHref={downloadHref}
      backHref="/employer"
    >
      {loadState.status === "loading" && (
        <MessagePanel message="Loading document…" />
      )}
      {loadState.status === "error" && (
        <MessagePanel message={loadState.message} backHref="/employer" />
      )}
      {loadState.status === "ready" && loadState.isPdf && (
        <iframe
          src={loadState.blobUrl}
          title={loadState.filename}
          style={{ flex: 1, width: "100%", border: 0, background: "#525659" }}
        />
      )}
      {loadState.status === "ready" && !loadState.isPdf && (
        <MessagePanel
          message="Opening preview in your device viewer…"
          hint="Use the share menu there if you need a copy on your device."
          actionHref={loadState.blobUrl}
          actionLabel="View document"
        />
      )}
    </ViewerShell>
  );
}

function ViewerShell({
  title,
  backHref = "/employer",
  downloadHref,
  children,
}: {
  title: string;
  backHref?: string;
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
          href={backHref}
          style={{
            color: "#93c5fd",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            flexShrink: 0,
          }}
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
            style={{
              color: "#9ca3af",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            Save copy
          </a>
        ) : null}
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
    </div>
  );
}

function MessagePanel({
  message,
  hint,
  actionHref,
  actionLabel,
  backHref,
}: {
  message: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
  backHref?: string;
}) {
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
      {hint ? <p style={{ margin: 0, fontSize: 13, color: "#9ca3af", maxWidth: 320 }}>{hint}</p> : null}
      {actionHref && actionLabel ? (
        <a
          href={actionHref}
          style={{
            marginTop: 8,
            background: "#2563eb",
            color: "white",
            textDecoration: "none",
            borderRadius: 10,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {actionLabel}
        </a>
      ) : null}
      {backHref ? (
        <Link href={backHref} style={{ color: "#93c5fd", fontSize: 13, textDecoration: "none" }}>
          Return to employer dashboard
        </Link>
      ) : null}
    </div>
  );
}
