import type { IncomingMessage, ServerResponse } from "node:http";

import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  readJsonBodyOrError,
  sendInvalidRequest,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
} from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { coreGatewayHandlers } from "./server-methods.js";
import type { GatewayRequestContext } from "./server-methods/types.js";

const log = createSubsystemLogger("gateway").child("dev-rpc");

const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Lazy reference set after gateway startup via setDevRpcContext().
let _context: GatewayRequestContext | null = null;

export function setDevRpcContext(ctx: GatewayRequestContext) {
  _context = ctx;
}

interface DevRpcBody {
  method?: unknown;
  params?: unknown;
}

export async function handleDevRpcHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { auth: ResolvedGatewayAuth; trustedProxies?: string[] },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/api/rpc") return false;

  // Only available when the gateway was started with --dev.
  if (process.env.OPENCLAW_GATEWAY_DEV !== "1") return false;

  if (req.method !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const cfg = loadConfig();
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: opts.auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
  });
  if (!authResult.ok) {
    sendUnauthorized(res);
    return true;
  }

  const bodyUnknown = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
  if (bodyUnknown === undefined) return true;
  const body = (bodyUnknown ?? {}) as DevRpcBody;

  const method = typeof body.method === "string" ? body.method.trim() : "";
  if (!method) {
    sendInvalidRequest(res, "body.method is required");
    return true;
  }

  const handler = coreGatewayHandlers[method];
  if (!handler) {
    sendJson(res, 404, { ok: false, error: `unknown method: ${method}` });
    return true;
  }

  if (!_context) {
    sendJson(res, 503, { ok: false, error: "gateway context not ready" });
    return true;
  }

  const params =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {};

  try {
    let result: unknown;
    let error: unknown;
    let responded = false;

    await handler({
      req: { type: "req", id: `dev-rpc-${Date.now()}`, method, params },
      params,
      // Dev-only: bypass scope checks by passing client: null.
      client: null,
      isWebchatConnect: () => false,
      respond: (ok, payload, err) => {
        if (responded) return;
        responded = true;
        if (ok) {
          result = payload;
        } else {
          error = err ?? payload;
        }
      },
      context: _context,
    });

    if (error) {
      sendJson(res, 400, { ok: false, error });
    } else {
      sendJson(res, 200, { ok: true, result: result ?? null });
    }
  } catch (err) {
    log.error(`dev-rpc ${method}: ${String(err)}`);
    sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return true;
}
