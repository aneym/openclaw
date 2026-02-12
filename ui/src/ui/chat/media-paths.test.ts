import { describe, expect, it } from "vitest";
import { extractImagePathsFromText, extractMediaLines, isImagePath } from "./media-paths.ts";

describe("media-paths", () => {
  it("extracts MEDIA lines and removes them from rendered text", () => {
    const input = "Done.\nMEDIA:/tmp/example.png\nMore text.";
    const result = extractMediaLines(input);

    expect(result.mediaPaths).toEqual(["/tmp/example.png"]);
    expect(result.cleanedText).toBe("Done.\nMore text.");
  });

  it("extracts both MEDIA lines and plain image paths", () => {
    const input =
      "MEDIA:'/tmp/first.png'\nGenerated /tmp/second.webp and /tmp/third.jpg for review.";
    const paths = extractImagePathsFromText(input);

    expect(paths).toEqual(["/tmp/first.png", "/tmp/second.webp", "/tmp/third.jpg"]);
  });

  it("detects supported image extensions", () => {
    expect(isImagePath("/tmp/a.png")).toBe(true);
    expect(isImagePath("/tmp/a.jpeg?cache=1")).toBe(true);
    expect(isImagePath("/tmp/a.txt")).toBe(false);
  });
});
