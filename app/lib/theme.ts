"use client";

export type Theme = typeof lightTheme;

export const lightTheme = {
  bg: "#f3f4f6",
  surface: "#ffffff",
  surfaceHover: "#f9fafb",
  border: "#d1d5db",
  borderLight: "#e5e7eb",
  text: "#0a0a0a",
  textMuted: "#3d3d3d",
  textFaint: "#666666",
  input: "#ffffff",
  inputBorder: "#b0b7c3",
  navBg: "#ffffff",
  navBorder: "#b8bcc4",
  badgeBg: "#e5e7eb",
  badgeText: "#1a202c",
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
