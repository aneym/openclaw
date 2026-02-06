import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

const external = ["@anthropic-ai/claude-agent-sdk"];

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    // Disable automatic cleaning to preserve dist/control-ui/ and other UI assets
    // that are built separately via `pnpm ui:build`
    clean: false,
  },
  {
    entry: "src/entry.ts",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    clean: false,
  },
  {
    dts: true,
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    clean: false,
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    clean: false,
  },
]);
