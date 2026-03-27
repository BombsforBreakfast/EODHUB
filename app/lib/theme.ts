"use client";

export type Theme = typeof lightTheme;

export const lightTheme = {
  bg: "#f3f4f6",
  surface: "#ffffff",
  surfaceHover: "#f9fafb",
  border: "#e5e7eb",
  borderLight: "#f3f4f6",
  text: "#111111",
  textMuted: "#666666",
  textFaint: "#999999",
  input: "#ffffff",
  inputBorder: "#d1d5db",
  navBg: "#ffffff",
  navBorder: "#cccccc",
  badgeBg: "#f3f4f6",
  badgeText: "#374151",
};

export const darkTheme: Theme = {
  bg: "#0f0f0f",
  surface: "#1c1c1c",
  surfaceHover: "#242424",
  border: "#2e2e2e",
  borderLight: "#232323",
  text: "#f0f0f0",
  textMuted: "#a0a0a0",
  textFaint: "#555555",
  input: "#1c1c1c",
  inputBorder: "#3a3a3a",
  navBg: "#1c1c1c",
  navBorder: "#3a3a3a",
  badgeBg: "#2a2a2a",
  badgeText: "#d1d5db",
};
