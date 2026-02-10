import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

const external = ["@anthropic-ai/claude-agent-sdk"];

const shared = {
  env,
  external,
  fixedExtension: false,
  platform: "node" as const,
  // Disable automatic cleaning to preserve dist/control-ui/ and other UI assets
  // that are built separately via `pnpm ui:build`
  clean: false,
  // Suppress per-chunk file listing in build output
  report: false,
};

export default defineConfig([
  { entry: "src/index.ts", ...shared },
  { entry: "src/entry.ts", ...shared },
  { entry: "src/plugin-sdk/index.ts", outDir: "dist/plugin-sdk", ...shared },
  { entry: "src/extensionAPI.ts", ...shared },
]);
