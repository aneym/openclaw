import { describe, expect, it } from "vitest";
import { compactConsoleMessageForDisplay } from "./subsystem.js";

describe("compactConsoleMessageForDisplay", () => {
  it("keeps short single-line messages unchanged", () => {
    expect(compactConsoleMessageForDisplay("gateway ready")).toBe("gateway ready");
  });

  it("compacts role-tagged multiline payloads", () => {
    const input = [
      "Error retaining messages: Command failed: uvx hindsight",
      "[role: user]",
      "hello",
      "[user:end]",
      "[role: assistant]",
      "world",
      "[assistant:end]",
    ].join("\n");
    const output = compactConsoleMessageForDisplay(input);
    expect(output).not.toContain("\n");
    expect(output).toContain("Error retaining messages");
    expect(output).toContain("[role: user]");
  });

  it("truncates very long messages", () => {
    const input = `Command failed: ${"x".repeat(3000)}`;
    const output = compactConsoleMessageForDisplay(input);
    expect(output).toContain("truncated");
    expect(output.length).toBeLessThan(700);
  });
});
