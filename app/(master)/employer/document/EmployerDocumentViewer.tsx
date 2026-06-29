"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  candidateDocumentApiHref,
  candidateDocumentMetaHref,
  documentExtension,
  type CandidateDocumentKind,
} from "../lib/candidateDocumentLinks";
import "./employerDocumentViewer.css";

function bindDocxPreviewFit(viewport: HTMLElement): () => void {
  const apply = () => {
    const canvas = viewport.querySelector(".employer-docx-canvas") as HTMLElement | null;
    const wrapper = viewport.querySelector(".docx-wrapper") as HTMLElement | null;
    if (!canvas || !wrapper) return;

    wrapper.classList.add("employer-docx-fit");
    const maxPageWidth = 816;
    const horizontalPadding = viewport.clientWidth <= 640 ? 16 : 24;
    const pageWidth = Math.min(maxPageWidth, Math.max(1, viewport.clientWidth - horizontalPadding));

    canvas.style.setProperty("--employer-docx-page-width", `${pageWidth}px`);
  };

  apply();
  requestAnimationFrame(apply);

  const observer = new ResizeObserver(apply);
  observer.observe(viewport);
  window.addEventListener("orientationchange", apply);
  return () => {
    observer.disconnect();
    window.removeEventListener("orientationchange", apply);
  };
}

type DocMeta = { url: string; filename: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; meta: DocMeta; ext: string };

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

  const metaHref = useMemo(() => {
    if (!userId || !kind) return null;
    return candidateDocumentMetaHref(userId, kind, tag ?? undefined);
  }, [userId, kind, tag]);

  const inlineHref = useMemo(() => {
    if (!userId || !kind) return null;
    return candidateDocumentApiHref(userId, kind, tag ?? undefined, "inline");
  }, [userId, kind, tag]);

  const downloadHref = useMemo(() => {
    if (!userId || !kind) return null;
    return candidateDocumentApiHref(userId, kind, tag ?? undefined, "download");
  }, [userId, kind, tag]);

  useEffect(() => {
    if (!metaHref) {
      setLoadState({ status: "error", message: "Missing document request." });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadState({ status: "loading" });
      try {
        const res = await fetch(metaHref, { credentials: "include" });
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "You do not have access to this document."
              : "Could not load document.",
          );
        }
        const meta = (await res.json()) as DocMeta;
        if (cancelled) return;
        setLoadState({ status: "ready", meta, ext: documentExtension(meta.filename || meta.url) });
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
  }, [metaHref]);

  if (!userId || !kind) {
    return (
      <ViewerShell title="Document">
        <MessagePanel message="Missing document request." />
      </ViewerShell>
    );
  }

  const title = loadState.status === "ready" ? loadState.meta.filename : kindLabel(kind);

  return (
    <ViewerShell title={title} downloadHref={downloadHref}>
      {loadState.status === "loading" && <MessagePanel message="Loading document…" />}
      {loadState.status === "error" && <MessagePanel message={loadState.message} />}
      {loadState.status === "ready" && (
        <DocumentFrame
          meta={loadState.meta}
          ext={loadState.ext}
          inlineHref={inlineHref}
          downloadHref={downloadHref}
        />
      )}
    </ViewerShell>
  );
}

function DocumentFrame({
  meta,
  ext,
  inlineHref,
  downloadHref,
}: {
  meta: DocMeta;
  ext: string;
  inlineHref: string | null;
  downloadHref: string | null;
}) {
  if (ext === "pdf") {
    return (
      <iframe
        src={meta.url}
        title={meta.filename}
        style={{ flex: 1, width: "100%", border: 0, background: "#525659" }}
      />
    );
  }

  if (ext === "docx" && inlineHref) {
    return <DocxRenderer inlineHref={inlineHref} filename={meta.filename} downloadHref={downloadHref} />;
  }

  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- candidate document image */}
        <img src={meta.url} alt={meta.filename} style={{ maxWidth: "100%", height: "auto" }} />
      </div>
    );
  }

  return (
    <MessagePanel
      message="This file type can't be previewed in the browser."
      hint="Save a copy to open it in another app."
      actionHref={downloadHref ?? meta.url}
      actionLabel="Save copy"
    />
  );
}

function DocxRenderer({
  inlineHref,
  filename,
  downloadHref,
}: {
  inlineHref: string;
  filename: string;
  downloadHref: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let unbindFit: (() => void) | undefined;
    const container = containerRef.current;
    (async () => {
      setState("loading");
      try {
        const [{ renderAsync }, res] = await Promise.all([
          import("docx-preview"),
          fetch(inlineHref, { credentials: "include" }),
        ]);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        if (cancelled || !container) return;
        container.innerHTML = "";
        await renderAsync(blob, container, undefined, {
          className: "docx-render",
          inWrapper: true,
          ignoreWidth: true,
          ignoreHeight: false,
          breakPages: true,
        });
        if (cancelled) return;
        const scrollHost = scrollRef.current;
        if (scrollHost) unbindFit = bindDocxPreviewFit(scrollHost);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      unbindFit?.();
    };
  }, [inlineHref]);

  return (
    <div ref={scrollRef} className="employer-docx-viewer">
      {state === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#f3f4f6", fontSize: 15, fontWeight: 600 }}>
          Loading document…
        </div>
      )}
      {state === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", color: "#f3f4f6" }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Couldn&apos;t render this document.</p>
          {downloadHref ? (
            <a
              href={downloadHref}
              style={{ background: "#2563eb", color: "white", textDecoration: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700 }}
            >
              Save copy
            </a>
          ) : null}
        </div>
      )}
      <div
        ref={containerRef}
        className="employer-docx-canvas"
        aria-label={filename}
        style={{ display: state === "ready" ? "flex" : "none" }}
      />
    </div>
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

function MessagePanel({
  message,
  hint,
  actionHref,
  actionLabel,
}: {
  message: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
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
      <Link href="/employer" style={{ color: "#93c5fd", fontSize: 13, textDecoration: "none" }}>
        Return to employer dashboard
      </Link>
    </div>
  );
}
