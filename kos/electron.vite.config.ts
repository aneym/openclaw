import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    server: {
      port: 5175,
    },
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@renderer": resolve("src/renderer/src"),
      },
      dedupe: ["react", "react-dom"],
    },
    plugins: [react(), tailwindcss()],
  },
});
