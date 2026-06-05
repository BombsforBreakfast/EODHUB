import React from "react";

type DesktopLayoutProps = {
  isMobile: boolean;
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  mobileStyle?: React.CSSProperties;
  desktopColumns?: string;
  desktopGap?: number;
  desktopMarginTop?: number;
  desktopAlignItems?: React.CSSProperties["alignItems"];
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
}: DesktopLayoutProps) {
  return (
    <div
      className="desktop-layout desktop-layout--grid"
      style={
        {
          ["--desktop-layout-columns" as string]: desktopColumns,
          ["--desktop-layout-gap" as string]: `${desktopGap}px`,
          ["--desktop-layout-margin-top" as string]: `${desktopMarginTop}px`,
          ["--desktop-layout-align" as string]: desktopAlignItems,
          width: "100%",
          ...(isMobile ? (mobileStyle ?? { marginTop: 12 }) : {}),
        } as React.CSSProperties
      }
    >
      <div className="desktop-layout-rail">{left}</div>
      <div className="desktop-layout-center">{center}</div>
      <div className="desktop-layout-rail">{right}</div>
    </div>
  );
}
