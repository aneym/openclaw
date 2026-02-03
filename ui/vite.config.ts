import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

export default defineConfig(() => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT || "19001";
  const gatewayOrigin = `http://localhost:${gatewayPort}`;
  return {
    base,
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
    },
    define: {
      __OPENCLAW_DEV_GATEWAY_PORT__: JSON.stringify(gatewayPort),
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": { target: gatewayOrigin, changeOrigin: true },
        "/avatar": { target: gatewayOrigin, changeOrigin: true },
      },
    },
  };
});
