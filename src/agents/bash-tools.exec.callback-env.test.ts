import { afterEach, expect, test } from "vitest";
import { resetProcessRegistryForTests } from "./bash-process-registry";
import { createExecTool } from "./bash-tools.exec";

afterEach(() => {
  resetProcessRegistryForTests();
});

test("exec injects OpenClaw callback env metadata for child processes", async () => {
  if (process.platform === "win32") {
    return;
  }

  const tool = createExecTool({
    host: "gateway",
    security: "full",
    ask: "off",
    sessionKey: "agent:main:main",
    messageProvider: "telegram",
    messageTo: "telegram:chat:123",
    messageThreadId: "456",
    messageAccountId: "acct-1",
    allowBackground: false,
  });

  const result = await tool.execute("toolcall", {
    command:
      "node -e 'process.stdout.write([process.env.OPENCLAW_SESSION_KEY,process.env.OPENCLAW_MESSAGE_CHANNEL,process.env.OPENCLAW_MESSAGE_TO,process.env.OPENCLAW_MESSAGE_THREAD_ID,process.env.OPENCLAW_MESSAGE_ACCOUNT_ID].join(\"|\"))'",
  });

  const text = result.content?.find((entry) => entry.type === "text")?.text ?? "";
  expect(text).toContain("agent:main:main|telegram|telegram:chat:123|456|acct-1");
});

test("exec preserves explicit callback env overrides passed by the command", async () => {
  if (process.platform === "win32") {
    return;
  }

  const tool = createExecTool({
    host: "gateway",
    security: "full",
    ask: "off",
    sessionKey: "agent:main:main",
    messageProvider: "telegram",
    allowBackground: false,
  });

  const result = await tool.execute("toolcall", {
    command: "node -e 'process.stdout.write(process.env.OPENCLAW_SESSION_KEY || \"\")'",
    env: {
      OPENCLAW_SESSION_KEY: "agent:override:session",
    },
  });

  const text = result.content?.find((entry) => entry.type === "text")?.text ?? "";
  expect(text).toContain("agent:override:session");
});
