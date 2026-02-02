#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const env = { ...process.env };
const cwd = process.cwd();
const compilerOverride = env.OPENCLAW_TS_COMPILER ?? env.CLAWDBOT_TS_COMPILER;
const compiler = compilerOverride === "tsc" ? "tsc" : "tsgo";

// Dev builds skip declarations and enable incremental for speed; production
// `pnpm build` uses tsc directly and keeps `declaration: true` from tsconfig.json.
// Note: --incremental must be a CLI flag because tsconfig.json has noEmit: true
// which prevents the config-level incremental from taking effect.
const devOverrides = ["--incremental", "--declaration", "false"];
const projectArgs = ["--project", "tsconfig.json"];

// ── Staleness check (ported from run-node.mjs) ──────────────────────────

const distRoot = path.join(cwd, "dist");
const distEntry = path.join(distRoot, "entry.js");
const buildStampPath = path.join(distRoot, ".buildstamp");
const srcRoot = path.join(cwd, "src");
const configFiles = [path.join(cwd, "tsconfig.json"), path.join(cwd, "package.json")];

const statMtime = (filePath) => {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
};

const isExcludedSource = (filePath) => {
  const relativePath = path.relative(srcRoot, filePath);
  if (relativePath.startsWith("..")) {
    return false;
  }
  return (
    relativePath.endsWith(".test.ts") ||
    relativePath.endsWith(".test.tsx") ||
    relativePath.endsWith(`test-helpers.ts`)
  );
};

const findLatestMtime = (dirPath, shouldSkip) => {
  let latest = null;
  const queue = [dirPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (shouldSkip?.(fullPath)) {
        continue;
      }
      const mtime = statMtime(fullPath);
      if (mtime == null) {
        continue;
      }
      if (latest == null || mtime > latest) {
        latest = mtime;
      }
    }
  }
  return latest;
};

const shouldBuild = () => {
  if (env.OPENCLAW_FORCE_BUILD === "1") {
    return true;
  }
  const stampMtime = statMtime(buildStampPath);
  if (stampMtime == null) {
    return true;
  }
  if (statMtime(distEntry) == null) {
    return true;
  }
  for (const filePath of configFiles) {
    const mtime = statMtime(filePath);
    if (mtime != null && mtime > stampMtime) {
      return true;
    }
  }
  const srcMtime = findLatestMtime(srcRoot, isExcludedSource);
  if (srcMtime != null && srcMtime > stampMtime) {
    return true;
  }
  return false;
};

const writeBuildStamp = () => {
  try {
    fs.mkdirSync(distRoot, { recursive: true });
    fs.writeFileSync(buildStampPath, `${Date.now()}\n`);
  } catch {
    // Best-effort stamp.
  }
};

// ── Suppress ExperimentalWarning respawn ─────────────────────────────────

const EXPERIMENTAL_WARNING_FLAG = "--disable-warning=ExperimentalWarning";
const nodeOptions = env.NODE_OPTIONS ?? "";
if (!nodeOptions.includes(EXPERIMENTAL_WARNING_FLAG) && !nodeOptions.includes("--no-warnings")) {
  env.NODE_OPTIONS = `${nodeOptions} ${EXPERIMENTAL_WARNING_FLAG}`.trim();
}
env.OPENCLAW_NODE_OPTIONS_READY = "1";

// ── Initial build (skip if dist is fresh) ────────────────────────────────

const needsBuild = shouldBuild();

if (needsBuild) {
  const t0 = performance.now();
  process.stderr.write(`build starting at ${new Date().toLocaleTimeString()}\n`);

  const initialBuild = spawnSync(
    "pnpm",
    ["exec", compiler, ...projectArgs, "--noEmit", "false", ...devOverrides],
    { cwd, env, stdio: "inherit" },
  );

  if (initialBuild.status !== 0) {
    process.exit(initialBuild.status ?? 1);
  }

  writeBuildStamp();
  const elapsed = ((performance.now() - t0) / 1000).toFixed(3);
  process.stderr.write(`build finished in ${elapsed}s\n`);
} else {
  process.stderr.write("build skipped (dist is fresh)\n");
}

// ── Watch compiler ───────────────────────────────────────────────────────

const watchArgs =
  compiler === "tsc"
    ? [...projectArgs, "--noEmit", "false", ...devOverrides, "--watch", "--preserveWatchOutput"]
    : [...projectArgs, "--noEmit", "false", ...devOverrides, "--watch"];

// Track whether the last tsgo compilation was clean.
// tsgo/tsc watch outputs "Found N error(s)." after each compile cycle.
let lastBuildClean = true;
let pendingRestart = false;

const compilerProcess = spawn("pnpm", ["exec", compiler, ...watchArgs], {
  cwd,
  env,
  stdio: ["inherit", "pipe", "inherit"],
});

compilerProcess.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  // tsc/tsgo: "Found 0 errors. Watching for file changes."
  //           "Found 3 error(s). Watching for file changes."
  const match = text.match(/Found (\d+) error/);
  if (match) {
    const errorCount = parseInt(match[1], 10);
    lastBuildClean = errorCount === 0;
    if (lastBuildClean) {
      writeBuildStamp();
      if (pendingRestart) {
        pendingRestart = false;
        console.error("[watch] build clean — proceeding with pending restart");
        startGateway();
      }
    } else {
      console.error(`[watch] build has ${errorCount} error(s) — restart blocked until clean`);
    }
  }
});

// ── Gateway process ──────────────────────────────────────────────────────

let nodeProcess = null;
let exiting = false;

function startGateway() {
  nodeProcess = spawn(process.execPath, ["openclaw.mjs", ...args], {
    cwd,
    env,
    stdio: "inherit",
  });

  nodeProcess.on("exit", (code) => {
    if (exiting) {
      return;
    }

    // Exit code 0 = intentional restart request (dev mode), respawn with fresh code
    if (code === 0) {
      if (!lastBuildClean) {
        console.error(
          "[watch] gateway wants to restart but build has errors — waiting for clean build...",
        );
        pendingRestart = true;
        return;
      }
      console.error("[watch] gateway exited, restarting...");
      setTimeout(() => startGateway(), 500);
      return;
    }

    // Non-zero exit = real crash, propagate
    cleanup(code ?? 1);
  });
}

function cleanup(code = 0) {
  if (exiting) {
    return;
  }
  exiting = true;
  nodeProcess?.kill("SIGTERM");
  compilerProcess.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

compilerProcess.on("exit", (code) => {
  if (exiting) {
    return;
  }
  cleanup(code ?? 1);
});

startGateway();
