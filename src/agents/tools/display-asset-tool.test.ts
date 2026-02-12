import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDisplayAssetTool } from "./display-asset-tool.js";

function getTextContent(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block?.text ?? "")
    .join("\n");
}

describe("display_asset tool", () => {
  it("emits FILE for remote video", async () => {
    const tool = createDisplayAssetTool();
    const result = await tool.execute("tc1", {
      path: "https://example.com/preview.mp4",
      caption: "preview clip",
    });
    const text = getTextContent(result);
    const details = (result as { details?: Record<string, unknown> }).details ?? {};

    expect(text).toContain("FILE:https://example.com/preview.mp4");
    expect(text).toContain("preview clip");
    expect(details.assetKind).toBe("video");
  });

  it("emits FILE for remote audio", async () => {
    const tool = createDisplayAssetTool();
    const result = await tool.execute("tc2", { path: "https://example.com/voice.mp3" });
    const text = getTextContent(result);
    const details = (result as { details?: Record<string, unknown> }).details ?? {};

    expect(text).toContain("FILE:https://example.com/voice.mp3");
    expect(details.assetKind).toBe("audio");
  });

  it("rejects explicit image kind for non-image files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-display-asset-"));
    const textPath = path.join(dir, "notes.txt");
    await fs.writeFile(textPath, "not an image");

    const tool = createDisplayAssetTool();
    await expect(tool.execute("tc3", { path: textPath, kind: "image" })).rejects.toThrow(
      /image file|does not match file extension/i,
    );
  });
});
