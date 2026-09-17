"use client";

export type Theme = typeof lightTheme;

export const lightTheme = {
  bg: "#e8eaee",
  surface: "#ffffff",
  surfaceHover: "#f9fafb",
  border: "rgba(0, 0, 0, 0.08)",
  borderLight: "rgba(0, 0, 0, 0.06)",
  text: "#0a0a0a",
  textMuted: "#3d3d3d",
  textFaint: "#666666",
  input: "#ffffff",
  inputBorder: "rgba(0, 0, 0, 0.12)",
  navBg: "#ffffff",
  navBorder: "rgba(0, 0, 0, 0.10)",
  badgeBg: "#e5e7eb",
  badgeText: "#1a202c",
  radius: 16,
  radiusSm: 10,
  shadow: "0 8px 28px rgba(15, 23, 42, 0.08)",
};

export const darkTheme: Theme = {
  bg: "#0f0f0f",
  surface: "#1c1c1c",
  surfaceHover: "#242424",
  border: "rgba(255, 255, 255, 0.10)",
  borderLight: "rgba(255, 255, 255, 0.06)",
  text: "#f0f0f0",
  textMuted: "#a0a0a0",
  textFaint: "#555555",
  input: "#1c1c1c",
  inputBorder: "rgba(255, 255, 255, 0.14)",
  navBg: "#1c1c1c",
  navBorder: "rgba(255, 255, 255, 0.12)",
  badgeBg: "#2a2a2a",
  badgeText: "#d1d5db",
  radius: 16,
  radiusSm: 10,
  shadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
};
