// Install console interceptor first to capture all logs
import "./lib/log-buffer";
import "./styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Reserve space for macOS hidden-inset title bar (traffic lights)
if (window.electron?.process?.platform === "darwin") {
  document.documentElement.style.setProperty("--titlebar-height", "38px");
}

// Apply dark/light class before React renders to prevent theme flash.
// initialThemeConfig is loaded synchronously in preload via sendSync.
{
  const mode = window.api?.initialThemeConfig?.mode ?? "dark";
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  if (resolved === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
