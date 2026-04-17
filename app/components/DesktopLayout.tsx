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
      style={
        isMobile
          ? mobileStyle ?? { marginTop: 12 }
          : {
              display: "grid",
              gridTemplateColumns: desktopColumns,
              gap: desktopGap,
              alignItems: desktopAlignItems,
              marginTop: desktopMarginTop,
              width: "100%",
              transition: "grid-template-columns 220ms ease",
            }
      }
    >
      {left}
      {center}
      {right}
    </div>
  );
}
