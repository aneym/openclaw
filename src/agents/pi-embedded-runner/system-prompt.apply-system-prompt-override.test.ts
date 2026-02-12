import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { applySystemPromptOverrideToSession } from "./system-prompt.js";

describe("applySystemPromptOverrideToSession", () => {
  it("updates agent prompt and session prompt cache", () => {
    const setSystemPrompt = vi.fn();
    const session = {
      agent: {
        setSystemPrompt,
      },
      _baseSystemPrompt: "base",
      _rebuildSystemPrompt: () => "base",
    } as unknown as AgentSession & {
      _baseSystemPrompt?: string;
      _rebuildSystemPrompt?: (toolNames: string[]) => string;
    };

    applySystemPromptOverrideToSession(session, "base\n\nhook");

    expect(setSystemPrompt).toHaveBeenCalledWith("base\n\nhook");
    expect(session._baseSystemPrompt).toBe("base\n\nhook");
    expect(session._rebuildSystemPrompt?.([])).toBe("base\n\nhook");
  });

  it("preserves appended prompt when prompt() falls back to _baseSystemPrompt", () => {
    const setSystemPrompt = vi.fn();
    const session = {
      agent: {
        setSystemPrompt,
      },
      _baseSystemPrompt: "base",
    } as unknown as AgentSession & {
      _baseSystemPrompt?: string;
      _rebuildSystemPrompt?: (toolNames: string[]) => string;
    };

    applySystemPromptOverrideToSession(session, "base\n\nhook");

    // Mirrors pi-coding-agent prompt() fallback:
    // this.agent.setSystemPrompt(this._baseSystemPrompt)
    session.agent.setSystemPrompt(session._baseSystemPrompt ?? "");

    expect(setSystemPrompt).toHaveBeenLastCalledWith("base\n\nhook");
  });
});
