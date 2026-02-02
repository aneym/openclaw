#!/usr/bin/env node

/**
 * PostToolUse hook: Status update after edits to large files
 *
 * Only reports when it matters to avoid context bloat:
 * - <800: Silent (PreToolUse already warned if needed)
 * - 800-1499: Report only if file grew
 * - 1500+: Always alert (critical - needs splitting)
 */

const fs = require("fs");
const path = require("path");

const REPORT_THRESHOLD = 800;
const CRITICAL_THRESHOLD = 1500;

function getLineCount(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split("\n").length;
  } catch {
    return null;
  }
}

function countLines(str) {
  if (!str) {
    return 0;
  }
  return str.split("\n").length;
}

function extractFilePath(input) {
  if (!input) {
    return null;
  }
  if (input.file_path) {
    return input.file_path;
  }
  if (input.edits && Array.isArray(input.edits)) {
    const paths = input.edits.map((edit) => edit.file_path).filter(Boolean);
    return [...new Set(paths)];
  }
  return null;
}

function calculateLineChange(toolInput) {
  if (toolInput.old_string !== undefined && toolInput.new_string !== undefined) {
    return countLines(toolInput.new_string) - countLines(toolInput.old_string);
  }
  if (toolInput.edits && Array.isArray(toolInput.edits)) {
    let totalChange = 0;
    for (const edit of toolInput.edits) {
      if (edit.old_string !== undefined && edit.new_string !== undefined) {
        totalChange += countLines(edit.new_string) - countLines(edit.old_string);
      }
    }
    return totalChange;
  }
  return null;
}

function checkFile(filePath, lineChange) {
  if (!filePath) {
    return null;
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  const lineCount = getLineCount(absolutePath);
  if (lineCount === null) {
    return null;
  }

  const filename = path.basename(absolutePath);

  // Critical: Always alert at 1500+
  if (lineCount >= CRITICAL_THRESHOLD) {
    return {
      message: `⚠️ CRITICAL: ${filename} is ${lineCount} lines. Must split before next change.`,
      critical: true,
    };
  }

  // Large file (800-1499): Only report if file grew
  if (lineCount >= REPORT_THRESHOLD) {
    if (lineChange !== null && lineChange > 0) {
      return {
        message: `📊 ${filename} is now ${lineCount} lines (+${lineChange}). Consider splitting soon.`,
        critical: false,
      };
    }
    // File didn't grow or we're removing lines - stay silent
    return null;
  }

  // Under 800: Silent (PreToolUse handles warnings)
  return null;
}

function main() {
  let inputData = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    inputData += chunk;
  });

  process.stdin.on("end", () => {
    try {
      const hookData = JSON.parse(inputData);
      const toolInput = hookData.tool_input || {};
      const filePaths = extractFilePath(toolInput);
      const lineChange = calculateLineChange(toolInput);

      const messages = [];

      const checkPath = (fp) => {
        const result = checkFile(fp, lineChange);
        if (result) {
          messages.push(result.message);
        }
      };

      if (Array.isArray(filePaths)) {
        for (const fp of filePaths) {
          checkPath(fp);
        }
      } else if (filePaths) {
        checkPath(filePaths);
      }

      if (messages.length > 0) {
        for (const msg of messages) {
          console.error(msg);
        }
        // Exit 2 so Claude sees the message
        process.exit(2);
      }

      process.exit(0);
    } catch {
      process.exit(0);
    }
  });
}

main();
