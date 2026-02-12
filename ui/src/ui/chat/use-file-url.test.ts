import { describe, expect, it } from "vitest";
import { useFileUrl } from "./use-file-url.ts";

describe("use-file-url", () => {
  it("builds auth file URL from ws gateway URL + token", () => {
    const url = useFileUrl("/tmp/example.png", {
      gatewayUrl: "ws://127.0.0.1:18789",
      token: "abc123",
    });
    const parsed = new URL(url);

    expect(parsed.origin).toBe("http://127.0.0.1:18789");
    expect(parsed.pathname).toBe("/api/files");
    expect(parsed.searchParams.get("path")).toBe("/tmp/example.png");
    expect(parsed.searchParams.get("token")).toBe("abc123");
  });

  it("falls back to password when token is empty", () => {
    const url = useFileUrl("/tmp/example.png", {
      gatewayUrl: "wss://gateway.openclaw.ai",
      token: "",
      password: "sekret",
    });
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://gateway.openclaw.ai");
    expect(parsed.searchParams.get("token")).toBe("sekret");
  });
});
