import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDisplayImageTool } from "./display-image-tool.js";

function getTextContent(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block?.text ?? "")
    .join("\n");
}

describe("display_image tool", () => {
  it("emits a MEDIA path for local images", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-display-image-"));
    const imagePath = path.join(dir, "preview.png");
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kvVYAAAAASUVORK5CYII=";
    await fs.writeFile(imagePath, Buffer.from(pngBase64, "base64"));

    const tool = createDisplayImageTool();
    const result = await tool.execute("tc1", { path: imagePath, caption: "preview image" });
    const text = getTextContent(result);
    const details = (result as { details?: Record<string, unknown> }).details ?? {};

    expect(text).toContain(`MEDIA:${imagePath}`);
    expect(text).toContain("preview image");
    expect(details.path).toBe(imagePath);
    expect(details.mimeType).toBe("image/png");
  });

  it("rejects non-image files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-display-image-"));
    const textPath = path.join(dir, "notes.txt");
    await fs.writeFile(textPath, "not an image");

    const tool = createDisplayImageTool();
    await expect(tool.execute("tc2", { path: textPath })).rejects.toThrow(
      /not an image|image file/i,
    );
  });

  it("accepts remote image URLs", async () => {
    const tool = createDisplayImageTool();
    const result = await tool.execute("tc3", { path: "https://example.com/image.webp" });
    const text = getTextContent(result);
    expect(text).toContain("MEDIA:https://example.com/image.webp");
  });
});
