#!/usr/bin/env node

/**
 * PreToolUse hook: File length guidance for maintainability
 *
 * Philosophy: Line count is a proxy for complexity, not a strict rule.
 * Goal: Gentle pressure toward smaller files, hard stop at genuinely problematic sizes.
 *
 * Thresholds:
 * - <500: Silent
 * - 500-599: Warn on large additions (20+ lines)
 * - 600-799: Warn on any addition
 * - 800+: Block ALL additions - must split file first
 *
 * CRITICAL: No "net-zero" gaming allowed. If you need to add code to a file
 * over 800 lines, you MUST split the file first. Removing whitespace/comments
 * to "make room" defeats the purpose of this hook.
 */

const fs = require("fs");
const path = require("path");

const SOFT_WARN = 500; // Warn on large additions
const HARD_WARN = 600; // Warn on any addition
const HARD_LIMIT = 800; // Block ALL additions - must split first

// Minimum lines that must be REMOVED to allow changes (actual refactoring)
const MIN_EXTRACTION_SIZE = 50;

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

function calculateLineChange(toolInput, filePath) {
  // Edit tool with old/new strings
  if (toolInput.old_string !== undefined && toolInput.new_string !== undefined) {
    return countLines(toolInput.new_string) - countLines(toolInput.old_string);
  }
  // MultiEdit tool
  if (toolInput.edits && Array.isArray(toolInput.edits)) {
    let totalChange = 0;
    for (const edit of toolInput.edits) {
      if (edit.old_string !== undefined && edit.new_string !== undefined) {
        totalChange += countLines(edit.new_string) - countLines(edit.old_string);
      }
    }
    return totalChange;
  }
  // Write tool - compare new content to existing file
  if (toolInput.content !== undefined && filePath) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    const currentLines = getLineCount(absolutePath);
    if (currentLines !== null) {
      const newLines = countLines(toolInput.content);
      return newLines - currentLines;
    }
  }
  return null;
}

// Calculate total lines being touched (old_string lines)
// Used to detect "gaming" - large net-zero edits are suspicious
function calculateEditSize(toolInput) {
  if (toolInput.old_string !== undefined) {
    return countLines(toolInput.old_string);
  }
  if (toolInput.edits && Array.isArray(toolInput.edits)) {
    let totalSize = 0;
    for (const edit of toolInput.edits) {
      if (edit.old_string !== undefined) {
        totalSize += countLines(edit.old_string);
      }
    }
    return totalSize;
  }
  return 0;
}

function getSplitSuggestions(filePath) {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);

  // Common split patterns based on file type and location
  if (filePath.includes("/gateway/") || filePath.includes("/agents/")) {
    return `
Split suggestions for gateway/agent files:
- Extract protocol handling → ${basename}-protocol${ext}
- Extract session logic → ${basename}-sessions${ext}
- Extract helper/utility functions → ${basename}-utils${ext}
- Extract types/interfaces → ${basename}.types${ext}`;
  }

  if (filePath.includes("/ui/") || filePath.includes("ui/src/")) {
    return `
Split suggestions for UI files:
- Extract sub-components → views/${basename}/
- Extract event handlers → ${basename}-handlers${ext}
- Extract render helpers → ${basename}-render${ext}`;
  }

  if (
    filePath.includes("/extensions/") ||
    filePath.includes("/telegram/") ||
    filePath.includes("/discord/") ||
    filePath.includes("/slack/") ||
    filePath.includes("/signal/")
  ) {
    return `
Split suggestions for channel files:
- Extract message handling → ${basename}-messages${ext}
- Extract webhook/event handlers → ${basename}-events${ext}
- Extract formatting → ${basename}-format${ext}`;
  }

  return `
Split suggestions:
- Group related functions into separate modules
- Extract types/interfaces to a ${basename}.types${ext} file
- Move utility functions to a utils/ directory
- Consider domain-based organization`;
}

function checkFile(filePath, lineChange, editSize) {
  if (!filePath) {
    return { status: "ok" };
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  const lineCount = getLineCount(absolutePath);
  if (lineCount === null) {
    return { status: "ok" };
  } // New file

  const filename = path.basename(absolutePath);
  const suggestions = getSplitSuggestions(absolutePath);
  const baseNameNoExt = path.basename(absolutePath, path.extname(absolutePath));
  const ext = path.extname(absolutePath);

  // Hard limit: Block ALL additions to files over 800 lines
  // Only allow edits that REMOVE code (actual refactoring) or small in-place fixes
  if (lineCount >= HARD_LIMIT) {
    // Allow edits that remove significant code (actual extraction/refactoring)
    if (lineChange !== null && lineChange <= -MIN_EXTRACTION_SIZE) {
      return { status: "ok" };
    }

    // Allow edits that genuinely remove code (not net-zero gaming)
    if (lineChange !== null && lineChange < 0) {
      return { status: "ok" };
    }

    // For net-zero edits (lineChange === 0), only allow SMALL fixes
    // Large net-zero edits are likely "gaming" (removing whitespace to add code)
    if (lineChange === 0) {
      // Allow small in-place fixes (under 5 lines changed)
      // Block large "net-zero" edits which are likely gaming
      if (editSize <= 5) {
        return { status: "ok" };
      }
      // Large net-zero edit - likely gaming
      return {
        status: "block",
        message: `[BLOCKED] ${filename} is ${lineCount} lines. Large net-zero edits (${editSize} lines) are not allowed.

**This looks like "gaming" - removing whitespace/comments to make room for new code.**

If you need to add functionality to this file, you MUST split it first:
1. Extract ${MIN_EXTRACTION_SIZE}+ lines of related code to a new file
2. THEN add your new code
${suggestions}`,
      };
    }

    // Block any addition (lineChange > 0)
    return {
      status: "block",
      message: `[BLOCKED] ${filename} is ${lineCount} lines (over ${HARD_LIMIT} limit).

**STOP. Do not try to work around this by removing whitespace or comments.**

This file is too large. Before adding ANY new code, you must SPLIT IT:

1. STOP what you're doing
2. Identify a cohesive group of functions/types to extract (${MIN_EXTRACTION_SIZE}+ lines)
3. Create a NEW file: ${baseNameNoExt}-[domain]${ext} or ${baseNameNoExt}/[domain]${ext}
4. MOVE the code to the new file (not copy)
5. Update imports in the original file
6. THEN come back and add your new code
${suggestions}

**WHY:** Large files hurt AI continuity. Future agents struggle to understand and modify them.
Splitting is not optional - it's required for maintainability.`,
    };
  }

  // Warn on any addition to files 600-799
  if (lineCount >= HARD_WARN && lineChange !== null && lineChange > 0) {
    return {
      status: "warn",
      message: `[WARNING] ${filename} is ${lineCount} lines (+${lineChange}). Approaching ${HARD_LIMIT} limit.

Consider proactively splitting this file to avoid hitting the hard limit.`,
    };
  }

  // Warn on large additions (20+) to files 500-599
  if (lineCount >= SOFT_WARN && lineChange !== null && lineChange >= 20) {
    return {
      status: "warn",
      message: `[NOTE] ${filename} is ${lineCount} lines (+${lineChange}).

Consider if this new code belongs in a separate module.`,
    };
  }

  return { status: "ok" };
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
      // For Write tool, we need the file path to compare against existing content
      const primaryPath = Array.isArray(filePaths) ? filePaths[0] : filePaths;
      const lineChange = calculateLineChange(toolInput, primaryPath);
      const editSize = calculateEditSize(toolInput);

      let hasBlock = false;
      let hasWarn = false;

      const checkPath = (fp) => {
        const result = checkFile(fp, lineChange, editSize);
        if (result.message) {
          console.error(result.message);
        }
        if (result.status === "block") {
          hasBlock = true;
        }
        if (result.status === "warn") {
          hasWarn = true;
        }
      };

      if (Array.isArray(filePaths)) {
        for (const fp of filePaths) {
          checkPath(fp);
        }
      } else if (filePaths) {
        checkPath(filePaths);
      }

      // Exit 2 = block tool from running
      // Exit 1 = warn but allow
      // Exit 0 = silent allow
      if (hasBlock) {
        process.exit(2);
      }
      if (hasWarn) {
        process.exit(1);
      }
      process.exit(0);
    } catch {
      process.exit(0);
    }
  });
}

main();
