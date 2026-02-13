#!/usr/bin/env node
/**
 * Dev server wrapper with keyboard shortcuts:
 *   r - Hard restart Electron (main + preload + renderer)
 *   c - Clear terminal
 *   q - Quit
 */

const { spawn, execSync } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const readline = require("readline");

let electronProcess = null;
let isRestarting = false;

const DEFAULT_GATEWAY_PORT = 18789;
const LEGACY_DEV_GATEWAY_PORT = 19001;
const DEFAULT_RENDERER_PORT = 5175;

function parseGatewayConfig(path, defaultPort) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const config = JSON.parse(raw);
    const configuredPort = Number(config?.gateway?.port ?? defaultPort);
    const port =
      Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : defaultPort;
    const rawToken = config?.gateway?.auth?.token;
    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    return {
      url: `ws://localhost:${port}`,
      token: token || undefined,
      source: path,
    };
  } catch {
    return null;
  }
}

function resolveGatewayConfig() {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  const candidates = [];

  if (stateDir) {
    candidates.push({
      path: join(stateDir, "openclaw.json"),
      defaultPort: DEFAULT_GATEWAY_PORT,
    });
  }

  candidates.push(
    {
      path: join(homedir(), ".openclaw", "openclaw.json"),
      defaultPort: DEFAULT_GATEWAY_PORT,
    },
    {
      path: join(homedir(), ".openclaw-dev", "openclaw.json"),
      defaultPort: LEGACY_DEV_GATEWAY_PORT,
    },
  );

  for (const candidate of candidates) {
    const parsed = parseGatewayConfig(candidate.path, candidate.defaultPort);
    if (parsed) {
      return parsed;
    }
  }

  return {
    url: `ws://localhost:${DEFAULT_GATEWAY_PORT}`,
    source: "default",
  };
}

function buildRendererLaunchHash(gatewayConfig) {
  const params = new URLSearchParams();
  params.set("gateway", gatewayConfig.url);
  if (gatewayConfig.token) {
    params.set("token", gatewayConfig.token);
  }
  return params.toString();
}

const gatewayConfig = resolveGatewayConfig();
const rendererLaunchHash = buildRendererLaunchHash(gatewayConfig);
const rendererLaunchUrl = `http://localhost:${DEFAULT_RENDERER_PORT}/#${rendererLaunchHash}`;

function killProcessTree(pid) {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${pid} /f /t`, { stdio: "ignore" });
    } catch {}
  } else {
    // On macOS/Linux, kill the process group and any child processes
    try {
      // First try to kill the process group
      process.kill(-pid, "SIGKILL");
    } catch {}

    try {
      // Also kill any orphaned electron processes started by this dev session
      execSync(`pkill -9 -f "electron.*kos"`, { stdio: "ignore" });
    } catch {}

    try {
      // Kill the specific PID if still alive
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

function startElectron() {
  console.log("\n\x1b[36m[dev]\x1b[0m Starting electron-vite...\n");

  // Use detached on Unix to create a process group we can kill later
  electronProcess = spawn("npx", ["electron-vite", "dev"], {
    stdio: ["inherit", "inherit", "inherit"],
    shell: true,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      KOS_DEV_RENDERER_HASH: rendererLaunchHash,
    },
  });

  electronProcess.on("close", (code) => {
    if (code !== null && !isRestarting) {
      console.log(`\n\x1b[33m[dev]\x1b[0m Electron exited with code ${code}`);
    }
    electronProcess = null;
  });

  electronProcess.on("error", (err) => {
    console.error(`\n\x1b[31m[dev]\x1b[0m Failed to start: ${err.message}`);
    electronProcess = null;
  });
}

function restartElectron() {
  if (isRestarting) {
    return;
  }
  isRestarting = true;

  console.log("\n\x1b[36m[dev]\x1b[0m Restarting Electron...\n");

  if (electronProcess && electronProcess.pid) {
    killProcessTree(electronProcess.pid);
    electronProcess = null;
  }

  // Wait for processes to fully terminate, then restart
  setTimeout(() => {
    isRestarting = false;
    startElectron();
  }, 1000);
}

function clearTerminal() {
  process.stdout.write("\x1b[2J\x1b[H");
  console.log("\x1b[36m[dev]\x1b[0m Terminal cleared\n");
}

function quit() {
  console.log("\n\x1b[36m[dev]\x1b[0m Shutting down...\n");
  if (electronProcess && electronProcess.pid) {
    killProcessTree(electronProcess.pid);
  }
  setTimeout(() => process.exit(0), 500);
}

// Set up keyboard input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on("keypress", (str, key) => {
  // Handle Ctrl+C
  if (key.ctrl && key.name === "c") {
    quit();
    return;
  }

  switch (key.name) {
    case "r":
      restartElectron();
      break;
    case "c":
      clearTerminal();
      break;
    case "q":
      quit();
      break;
  }
});

// Handle process signals
process.on("SIGINT", quit);
process.on("SIGTERM", quit);

// Start with process group for clean kills
if (process.platform !== "win32") {
  // Detach to create new process group
  process.env.ELECTRON_VITE_DEV_WRAPPER = "1";
}

// Show instructions
console.log("\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
console.log("\x1b[36m  kOS Dev Server\x1b[0m");
console.log("\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
console.log("  \x1b[33mr\x1b[0m - Restart Electron (hard reload)");
console.log("  \x1b[33mc\x1b[0m - Clear terminal");
console.log("  \x1b[33mq\x1b[0m - Quit");
console.log(`  \x1b[33mlink\x1b[0m - ${rendererLaunchUrl}`);
console.log(
  `  \x1b[33mgateway\x1b[0m - ${
    gatewayConfig.token
      ? `${gatewayConfig.url}#token=${encodeURIComponent(gatewayConfig.token)}`
      : gatewayConfig.url
  }`,
);
console.log(`  \x1b[33msource\x1b[0m - ${gatewayConfig.source}`);
console.log("\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

if (process.argv.includes("--no-electron")) {
  console.log("\n\x1b[36m[dev]\x1b[0m --no-electron mode: renderer only (no Electron)\n");
  const viteProcess = spawn("npx", ["electron-vite", "dev", "--rendererOnly"], {
    stdio: ["inherit", "inherit", "inherit"],
    shell: true,
    env: {
      ...process.env,
      KOS_DEV_RENDERER_HASH: rendererLaunchHash,
    },
  });
  viteProcess.on("close", (code) => process.exit(code ?? 0));
} else {
  startElectron();
}
