"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { lightTheme, darkTheme, type Theme } from "./theme";

type ThemeContextType = {
  isDark: boolean;
  toggleDark: () => void;
  t: Theme;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  toggleDark: () => {},
  t: darkTheme,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const themeDomReady = useRef(false);

  // Sync CSS variables on <html> with app theme so body background/text never disagree with useTheme().
  // useLayoutEffect avoids a frame where [isDark] was false and overwrote a correct system/stored dark choice.
  useLayoutEffect(() => {
    if (!themeDomReady.current) {
      themeDomReady.current = true;
      const stored = localStorage.getItem("eod-theme");
      let next = true;
      if (stored === "dark") next = true;
      else if (stored === "light") next = false;
      else next = true;
      setIsDark(next);
      document.documentElement.dataset.theme = next ? "dark" : "light";
      document.body.dataset.dark = next ? "true" : "";
      return;
    }
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.body.dataset.dark = isDark ? "true" : "";
  }, [isDark]);

  function toggleDark() {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("eod-theme", next ? "dark" : "light");
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark, t: isDark ? darkTheme : lightTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
