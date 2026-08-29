import React from "react";

type DesktopLayoutProps = {
  isMobile: boolean;
  left?: React.ReactNode | null;
  center: React.ReactNode;
  right?: React.ReactNode | null;
  mobileStyle?: React.CSSProperties;
  desktopColumns?: string;
  desktopGap?: number;
  desktopMarginTop?: number;
  desktopAlignItems?: React.CSSProperties["alignItems"];
  desktopJustifyContent?: React.CSSProperties["justifyContent"];
  /** Caps the whole grid and centers it (feed + rail as one block). */
  desktopMaxWidth?: number;
};

export default function DesktopLayout({
  isMobile,
  left,
  center,
  right,
  mobileStyle,
  desktopColumns = "280px minmax(0, 1fr) 360px",
  desktopGap = 24,
  desktopMarginTop = 20,
  desktopAlignItems = "start",
  desktopJustifyContent = "start",
  desktopMaxWidth,
}: DesktopLayoutProps) {
  return (
    <div
      className={`desktop-layout desktop-layout--grid${desktopMaxWidth ? " desktop-layout--centered-pair" : ""}`}
      style={
        {
          ["--desktop-layout-columns" as string]: desktopColumns,
          ["--desktop-layout-gap" as string]: `${desktopGap}px`,
          ["--desktop-layout-margin-top" as string]: `${desktopMarginTop}px`,
          ["--desktop-layout-align" as string]: desktopAlignItems,
          ["--desktop-layout-justify" as string]: desktopJustifyContent,
          width: "100%",
          ...(desktopMaxWidth
            ? { maxWidth: desktopMaxWidth, marginLeft: "auto", marginRight: "auto" }
            : {}),
          ...(isMobile ? (mobileStyle ?? { marginTop: 12 }) : {}),
        } as React.CSSProperties
      }
    >
      {left ? <div className="desktop-layout-rail">{left}</div> : null}
      <div className="desktop-layout-center">{center}</div>
      {right ? <div className="desktop-layout-rail">{right}</div> : null}
    </div>
  );
}
