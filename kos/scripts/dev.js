#!/usr/bin/env node
/**
 * Dev server wrapper with keyboard shortcuts:
 *   r - Hard restart Electron (main + preload + renderer)
 *   c - Clear terminal
 *   q - Quit
 */

const { spawn, execSync } = require("child_process");
const readline = require("readline");

let electronProcess = null;
let isRestarting = false;

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
  if (isRestarting) return;
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
console.log("\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

startElectron();
