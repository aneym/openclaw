import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ENTRY = path.resolve(import.meta.dirname, "../../dist/entry.js");

describe("openclaw MCP server", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [ENTRY, "mcp", "serve"],
    });
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);
  }, 15_000);

  afterAll(async () => {
    await client?.close();
  });

  it("lists all four tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).toSorted();
    expect(names).toEqual(["list_sessions", "report_back", "session_history", "session_send"]);
  });

  it("report_back fails without OPENCLAW_SESSION_KEY", async () => {
    // The test process doesn't set OPENCLAW_SESSION_KEY, so report_back should fail.
    const result = await client.callTool({
      name: "report_back",
      arguments: { message: "test" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("OPENCLAW_SESSION_KEY");
  });

  it("session_send returns an error for empty sessionKey", async () => {
    const result = await client.callTool({
      name: "session_send",
      arguments: { sessionKey: "", message: "test" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("sessionKey is required");
  });

  it("session_send returns an error for empty message", async () => {
    const result = await client.callTool({
      name: "session_send",
      arguments: { sessionKey: "agent:test:main", message: "" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("message is required");
  });

  it("session_history returns an error for empty sessionKey", async () => {
    const result = await client.callTool({
      name: "session_history",
      arguments: { sessionKey: "" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("sessionKey is required");
  });

  it("list_sessions returns sessions or gateway error", async () => {
    const result = await client.callTool({
      name: "list_sessions",
      arguments: { limit: 3 },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    if (!result.isError) {
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty("sessions");
      expect(Array.isArray(parsed.sessions)).toBe(true);
      if (parsed.sessions.length > 0) {
        expect(parsed.sessions[0]).toHaveProperty("sessionKey");
      }
    } else {
      expect(text).toContain("Error:");
    }
  }, 15_000);

  it("session_history returns messages for a valid session", async () => {
    const result = await client.callTool({
      name: "session_history",
      arguments: { sessionKey: "agent:main:main", limit: 5 },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    if (!result.isError) {
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty("sessionKey", "agent:main:main");
      expect(parsed).toHaveProperty("messages");
      expect(Array.isArray(parsed.messages)).toBe(true);
    } else {
      expect(text).toContain("Error:");
    }
  }, 15_000);

  it("session_send delivers to the gateway", async () => {
    const result = await client.callTool({
      name: "session_send",
      arguments: {
        sessionKey: "agent:main:mcp-e2e-test",
        message: "MCP e2e test ping",
        deliver: false,
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    if (!result.isError) {
      const parsed = JSON.parse(text);
      expect(parsed).toBeDefined();
    } else {
      expect(text).toContain("Error:");
    }
  }, 15_000);
});
