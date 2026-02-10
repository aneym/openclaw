import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  loadWorkspaceBootstrapFiles,
  filterBootstrapFilesForSession,
} from "./workspace.js";

describe("loadWorkspaceBootstrapFiles", () => {
  it("includes MEMORY.md when present", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: "MEMORY.md", content: "memory" });

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(1);
    expect(memoryEntries[0]?.missing).toBe(false);
    expect(memoryEntries[0]?.content).toBe("memory");
  });

  it("includes memory.md when MEMORY.md is absent", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: "memory.md", content: "alt" });

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(1);
    expect(memoryEntries[0]?.missing).toBe(false);
    expect(memoryEntries[0]?.content).toBe("alt");
  });

  it("omits memory entries when no memory files exist", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(0);
  });

  it("includes markdown files under TOOLS.d", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    await fs.mkdir(path.join(tempDir, "TOOLS.d", "hosts"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "TOOLS.d", "10-index.md"), "index", "utf-8");
    await fs.writeFile(path.join(tempDir, "TOOLS.d", "hosts", "20-prod.md"), "prod", "utf-8");
    await fs.writeFile(path.join(tempDir, "TOOLS.d", "hosts", "notes.txt"), "ignore", "utf-8");

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const splitEntries = files.filter((file) => file.name.startsWith("TOOLS.d/"));

    expect(splitEntries.map((entry) => entry.name)).toEqual([
      "TOOLS.d/10-index.md",
      "TOOLS.d/hosts/20-prod.md",
    ]);
    expect(splitEntries.map((entry) => entry.content)).toEqual(["index", "prod"]);
  });
});

describe("filterBootstrapFilesForSession", () => {
  it("keeps TOOLS.d files for subagent sessions", () => {
    const files = [
      {
        name: DEFAULT_AGENTS_FILENAME,
        path: "/tmp/AGENTS.md",
        content: "agents",
        missing: false,
      },
      {
        name: DEFAULT_TOOLS_FILENAME,
        path: "/tmp/TOOLS.md",
        content: "tools",
        missing: false,
      },
      {
        name: "TOOLS.d/ssh.md",
        path: "/tmp/TOOLS.d/ssh.md",
        content: "ssh notes",
        missing: false,
      },
      {
        name: DEFAULT_SOUL_FILENAME,
        path: "/tmp/SOUL.md",
        content: "soul",
        missing: false,
      },
    ];

    const filtered = filterBootstrapFilesForSession(files, "agent:main:subagent:abc");

    expect(filtered.map((file) => file.name)).toEqual([
      DEFAULT_AGENTS_FILENAME,
      DEFAULT_TOOLS_FILENAME,
      "TOOLS.d/ssh.md",
    ]);
  });
});
