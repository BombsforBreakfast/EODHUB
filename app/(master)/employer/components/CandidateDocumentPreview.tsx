"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  candidateDocumentApiHref,
  candidateDocumentMetaHref,
  documentExtension,
  type CandidateDocumentKind,
} from "../lib/candidateDocumentLinks";
import { openDocumentLink } from "@/app/lib/native/nativeFileOpen";
import "../document/employerDocumentViewer.css";

type DocMeta = { url: string; filename: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; meta: DocMeta; ext: string };

type Props = {
  userId: string;
  kind: CandidateDocumentKind;
  tag?: string;
  minHeight?: number | string;
};

export default function CandidateDocumentPreview({
  userId,
  kind,
  tag,
  minHeight = 480,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const metaHref = useMemo(
    () => candidateDocumentMetaHref(userId, kind, tag),
    [userId, kind, tag],
  );

  const inlineHref = useMemo(
    () => candidateDocumentApiHref(userId, kind, tag, "inline"),
    [userId, kind, tag],
  );

  const downloadHref = useMemo(
    () => candidateDocumentApiHref(userId, kind, tag, "download"),
    [userId, kind, tag],
  );

  useEffect(() => {
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

  return (
    <div
      className="employer-document-preview-root"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: minHeight === 0 ? 0 : minHeight,
        minWidth: 0,
        overflow: "hidden",
        background: "#525659",
      }}
    >
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
    </div>
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
  inlineHref: string;
  downloadHref: string;
}) {
  if (ext === "pdf") {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          overflow: "hidden",
          background: "#525659",
        }}
      >
        <iframe
          src={meta.url}
          title={meta.filename}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            background: "#525659",
          }}
          scrolling="yes"
        />
      </div>
    );
  }

  if (ext === "docx") {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <DocxRenderer inlineHref={inlineHref} filename={meta.filename} downloadHref={downloadHref} />
      </div>
    );
  }

  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return (
      <div className="employer-document-frame employer-document-frame--scroll">
        <div className="employer-document-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element -- candidate document image */}
          <img src={meta.url} alt={meta.filename} />
        </div>
      </div>
    );
  }

  return (
    <MessagePanel
      message="This file type can't be previewed in the browser."
      hint="Save a copy to open it in another app."
      actionHref={downloadHref}
      actionNativeOpen
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
  downloadHref: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
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
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inlineHref]);

  return (
    <div className="employer-docx-viewer employer-docx-viewer--embedded">
      {state === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#f3f4f6", fontSize: 15, fontWeight: 600 }}>
          Loading document…
        </div>
      )}
      {state === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", color: "#f3f4f6" }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Couldn&apos;t render this document.</p>
          <a
            href={downloadHref}
            style={{ background: "#2563eb", color: "white", textDecoration: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700 }}
          >
            Save copy
          </a>
        </div>
      )}
      <div
        ref={containerRef}
        className="employer-docx-canvas"
        aria-label={filename}
        style={{ display: state === "ready" ? "block" : "none" }}
      />
    </div>
  );
}

function MessagePanel({
  message,
  hint,
  actionHref,
  actionNativeOpen,
  actionLabel,
}: {
  message: string;
  hint?: string;
  actionHref?: string;
  actionNativeOpen?: boolean;
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
        color: "#f3f4f6",
      }}
    >
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{message}</p>
      {hint ? <p style={{ margin: 0, fontSize: 13, color: "#9ca3af", maxWidth: 320 }}>{hint}</p> : null}
      {actionHref && actionLabel ? (
        <a
          href={actionHref}
          onClick={(event) => {
            if (!actionNativeOpen) return;
            void openDocumentLink(event, actionHref);
          }}
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
    </div>
  );
}
