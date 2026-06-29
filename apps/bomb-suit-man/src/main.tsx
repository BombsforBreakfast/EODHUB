import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/app/lib/ThemeContext";
import { AuthProvider } from "@bsm/context/AuthProvider";
import App from "@bsm/App";
import "../../../app/globals.css";

document.documentElement.dataset.theme = "dark";
document.body.dataset.dark = "true";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
