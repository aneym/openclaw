import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { listMemoryFiles } from "../../memory/internal.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { resolveAgentConfig, resolveAgentWorkspaceDir } from "../agent-scope.js";
import { jsonResult, readStringParam } from "./common.js";
import { createAgentToAgentPolicy } from "./sessions-helpers.js";

const AgentMemorySearchSchema = Type.Object({
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  query: Type.String({ minLength: 1 }),
});

type SearchMatch = {
  path: string;
  snippet: string;
  lineStart: number;
  lineEnd: number;
};

const MAX_RESULTS = 5;
const MAX_CHARS_PER_FILE = 2000;
const CONTEXT_LINES = 2;

/**
 * Simple text search in memory files. Returns excerpts with context lines.
 */
async function searchMemoryFiles(workspaceDir: string, query: string): Promise<SearchMatch[]> {
  const memoryFiles = await listMemoryFiles(workspaceDir);
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  if (queryTerms.length === 0) {
    return [];
  }

  const matches: SearchMatch[] = [];

  for (const absPath of memoryFiles) {
    if (matches.length >= MAX_RESULTS) {
      break;
    }

    try {
      const content = await fs.readFile(absPath, "utf-8");
      const lines = content.split("\n");
      const relPath = path.relative(workspaceDir, absPath).replace(/\\/g, "/");

      // Search for lines containing query terms
      const matchingLineIndices: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const lowerLine = line.toLowerCase();
        const hasAllTerms = queryTerms.every((term) => lowerLine.includes(term));
        if (hasAllTerms) {
          matchingLineIndices.push(i);
        }
      }

      if (matchingLineIndices.length === 0) {
        continue;
      }

      // Group consecutive matches and extract excerpts with context
      const excerpts: Array<{ start: number; end: number; text: string }> = [];
      let currentGroup: number[] = [];

      for (let i = 0; i < matchingLineIndices.length; i++) {
        const idx = matchingLineIndices[i];
        if (idx === undefined) {
          continue;
        }

        if (currentGroup.length === 0) {
          currentGroup.push(idx);
        } else {
          const lastIdx = currentGroup[currentGroup.length - 1];
          if (lastIdx !== undefined && idx <= lastIdx + CONTEXT_LINES * 2 + 1) {
            currentGroup.push(idx);
          } else {
            // Flush current group
            if (currentGroup.length > 0) {
              excerpts.push(extractExcerpt(lines, currentGroup));
            }
            currentGroup = [idx];
          }
        }
      }

      // Flush last group
      if (currentGroup.length > 0) {
        excerpts.push(extractExcerpt(lines, currentGroup));
      }

      // Add excerpts from this file
      for (const excerpt of excerpts) {
        if (matches.length >= MAX_RESULTS) {
          break;
        }

        const snippetText = excerpt.text.slice(0, MAX_CHARS_PER_FILE);
        matches.push({
          path: relPath,
          snippet: snippetText,
          lineStart: excerpt.start + 1, // 1-indexed
          lineEnd: excerpt.end + 1, // 1-indexed
        });
      }
    } catch (err) {
      // Skip files that can't be read
      continue;
    }
  }

  return matches;
}

/**
 * Extract an excerpt from lines with context around matching indices.
 */
function extractExcerpt(
  lines: string[],
  matchingIndices: number[],
): { start: number; end: number; text: string } {
  if (matchingIndices.length === 0) {
    return { start: 0, end: 0, text: "" };
  }

  const first = matchingIndices[0] ?? 0;
  const last = matchingIndices[matchingIndices.length - 1] ?? 0;

  const start = Math.max(0, first - CONTEXT_LINES);
  const end = Math.min(lines.length - 1, last + CONTEXT_LINES);

  const excerptLines = lines.slice(start, end + 1);
  return {
    start,
    end,
    text: excerptLines.join("\n"),
  };
}

/**
 * Validate that a path is a safe memory file.
 * Only MEMORY.md and memory/*.md are allowed.
 */
function isAllowedMemoryPath(relPath: string): boolean {
  const normalized = relPath.trim().toLowerCase();
  if (normalized === "memory.md") {
    return true;
  }
  if (normalized.startsWith("memory/") && normalized.endsWith(".md")) {
    return true;
  }
  return false;
}

export function createAgentMemorySearchTool(): AnyAgentTool {
  return {
    label: "Agent Memory Search",
    name: "agent_memory_search",
    description:
      "Search another agent's memory files (MEMORY.md + memory/*.md) for relevant information.",
    parameters: AgentMemorySearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const agentId = readStringParam(params, "agentId", { required: true });
      const query = readStringParam(params, "query", { required: true });

      const cfg = loadConfig();
      const a2aPolicy = createAgentToAgentPolicy(cfg);

      // Check if agent-to-agent is enabled
      if (!a2aPolicy.enabled) {
        return jsonResult({
          results: [],
          error:
            "Agent-to-agent memory search is disabled. Set tools.agentToAgent.enabled=true to enable.",
        });
      }

      const normalizedAgentId = normalizeAgentId(agentId);

      // Resolve target agent config
      const targetAgentConfig = resolveAgentConfig(cfg, normalizedAgentId);
      if (!targetAgentConfig) {
        return jsonResult({
          results: [],
          error: `Agent not found: ${agentId}`,
        });
      }

      // Get workspace directory
      const workspaceDir = resolveAgentWorkspaceDir(cfg, normalizedAgentId);

      try {
        const matches = await searchMemoryFiles(workspaceDir, query);

        // Validate that all returned paths are safe memory files
        const safeMatches = matches.filter((match) => isAllowedMemoryPath(match.path));

        return jsonResult({
          agentId: normalizedAgentId,
          query,
          results: safeMatches,
          count: safeMatches.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({
          results: [],
          error: `Failed to search memory: ${message}`,
        });
      }
    },
  };
}
