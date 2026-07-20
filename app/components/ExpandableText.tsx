"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  /** Plain-text length for first-paint toggle hint before layout measure */
  textLength?: number;
  maxLines?: number;
  minCharsToToggle?: number;
  style?: CSSProperties;
  wrapperStyle?: CSSProperties;
  toggleColor?: string;
  expandLabel?: string;
  collapseLabel?: string;
};

export default function ExpandableText({
  children,
  textLength,
  maxLines = 8,
  minCharsToToggle = 280,
  style,
  wrapperStyle,
  toggleColor,
  expandLabel = "Show all",
  collapseLabel = "Show less",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el || expanded) {
      if (expanded) setOverflows(true);
      return;
    }
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    measure();
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const likelyLong =
    textLength !== undefined && textLength > minCharsToToggle;
  const showToggle = expanded || overflows || likelyLong;

  const clampStyle: CSSProperties = expanded
    ? {}
    : {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: maxLines,
        overflow: "hidden",
      };

  return (
    <div style={{ maxWidth: "100%", minWidth: 0, ...wrapperStyle }}>
      <div
        ref={contentRef}
        style={{
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          maxWidth: "100%",
          minWidth: 0,
          ...style,
          ...clampStyle,
        }}
      >
        {children}
      </div>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: toggleColor ?? "inherit",
            fontSize: 13,
            fontWeight: 700,
            marginTop: 4,
          }}
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}
