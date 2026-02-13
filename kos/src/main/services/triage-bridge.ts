import { randomBytes } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";

export interface TriageBridgeInfo {
  endpoint: string;
  token: string;
}

export interface TriageBridgeEvent {
  source: "claude" | "codex" | "terminal";
  terminalId: string;
  title?: string;
  preview?: string;
  occurredAt?: number;
  sourceEventId?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      // Hard limit to avoid abuse
      if (data.length > 256 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export async function startTriageBridge(opts: {
  onEvent: (event: TriageBridgeEvent) => void;
}): Promise<{ info: TriageBridgeInfo; close: () => Promise<void> }> {
  const token = randomBytes(24).toString("hex");

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method !== "POST" || req.url !== "/triage/event") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      const auth = String(req.headers["authorization"] ?? "");
      if (auth !== `Bearer ${token}`) {
        res.statusCode = 401;
        res.end("unauthorized");
        return;
      }

      const raw = await readBody(req);
      const parsed = JSON.parse(raw) as Partial<TriageBridgeEvent>;

      if (!parsed || typeof parsed !== "object") {
        res.statusCode = 400;
        res.end("bad request");
        return;
      }
      if (parsed.source !== "claude" && parsed.source !== "codex" && parsed.source !== "terminal") {
        res.statusCode = 400;
        res.end("bad source");
        return;
      }
      if (!parsed.terminalId || typeof parsed.terminalId !== "string") {
        res.statusCode = 400;
        res.end("missing terminalId");
        return;
      }

      opts.onEvent({
        source: parsed.source,
        terminalId: parsed.terminalId,
        title: typeof parsed.title === "string" ? parsed.title : undefined,
        preview: typeof parsed.preview === "string" ? parsed.preview : undefined,
        occurredAt: typeof parsed.occurredAt === "number" ? parsed.occurredAt : undefined,
        sourceEventId: typeof parsed.sourceEventId === "string" ? parsed.sourceEventId : undefined,
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.statusCode = 500;
      res.end("error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("triage bridge failed to bind");
  }

  const endpoint = `http://127.0.0.1:${address.port}/triage/event`;

  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { info: { endpoint, token }, close };
}
