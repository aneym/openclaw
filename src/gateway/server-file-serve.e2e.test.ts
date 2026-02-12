import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { testState } from "./test-helpers.mocks.js";
import { getFreePort, installGatewayTestHooks, startGatewayServer } from "./test-helpers.server.js";

installGatewayTestHooks({ scope: "suite" });

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kvVYAAAAASUVORK5CYII=";

function resolveGatewayToken(): string {
  const token = (testState.gatewayAuth as { token?: string } | undefined)?.token;
  if (!token) {
    throw new Error("test gateway token missing");
  }
  return token;
}

async function withGatewayServer(
  run: (params: { port: number; token: string }) => Promise<void>,
): Promise<void> {
  const port = await getFreePort();
  const server = await startGatewayServer(port, { bind: "loopback" });
  try {
    await run({ port, token: resolveGatewayToken() });
  } finally {
    await server.close();
  }
}

let tempDir: string | null = null;

afterEach(async () => {
  if (!tempDir) {
    return;
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("GET /api/files", () => {
  test("requires gateway auth", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-files-"));
    const filePath = path.join(tempDir, "image.png");
    await fs.writeFile(filePath, Buffer.from(TINY_PNG_BASE64, "base64"));

    await withGatewayServer(async ({ port }) => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/files?path=${encodeURIComponent(filePath)}`,
      );
      expect(res.status).toBe(401);
    });
  });

  test("serves files with bearer auth and sets MIME/cache headers", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-files-"));
    const filePath = path.join(tempDir, "image.png");
    await fs.writeFile(filePath, Buffer.from(TINY_PNG_BASE64, "base64"));

    await withGatewayServer(async ({ port, token }) => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/files?path=${encodeURIComponent(filePath)}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^image\/png/);
      expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.byteLength).toBeGreaterThan(0);
    });
  });

  test("accepts token query auth", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-files-"));
    const filePath = path.join(tempDir, "doc.txt");
    await fs.writeFile(filePath, "hello world", "utf-8");

    await withGatewayServer(async ({ port, token }) => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/files?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`,
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("hello world");
    });
  });

  test("rejects paths outside allowlisted roots", async () => {
    const outsidePath = path.join(path.parse(process.cwd()).root, "outside.png");

    await withGatewayServer(async ({ port, token }) => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/files?path=${encodeURIComponent(outsidePath)}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(403);
    });
  });

  test("rejects directory paths", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-files-"));
    const dirPath = path.join(tempDir, "images.png");
    await fs.mkdir(dirPath);

    await withGatewayServer(async ({ port, token }) => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/files?path=${encodeURIComponent(dirPath)}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "Path is not a file" });
    });
  });

  test("rejects symlink escapes outside allowlisted roots", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-files-"));
    const targetFile = path.join(process.cwd(), "package.json");
    const symlinkPath = path.join(tempDir, "linked.json");
    await fs.symlink(targetFile, symlinkPath);

    await withGatewayServer(async ({ port, token }) => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/files?path=${encodeURIComponent(symlinkPath)}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(403);
    });
  });
});
