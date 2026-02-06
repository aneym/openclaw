import { buildDeviceAuthPayload } from "../../../src/gateway/device-auth.js";
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  type GatewayClientMode,
  type GatewayClientName,
} from "../../../src/gateway/protocol/client-info.js";
import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from "./device-auth.ts";
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity.ts";
import { generateUUID } from "./uuid.ts";

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientName?: GatewayClientName;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  instanceId?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

// 4008 = application-defined code (browser rejects 1008 "Policy Violation")
const CONNECT_FAILED_CLOSE_CODE = 4008;

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;

  constructor(private opts: GatewayBrowserClientOptions) {}

  start() {
    this.closed = false;
    console.log("[gateway] start() → connecting to", this.opts.url);
    this.connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    if (this.closed) {
      return;
    }
    console.log("[gateway] connect() → opening WebSocket to", this.opts.url);
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => {
      console.log("[gateway] WebSocket open");
      this.queueConnect();
    });
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      console.log("[gateway] WebSocket closed code=%d reason=%s", ev.code, reason || "(none)");
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason });
      this.scheduleReconnect();
    });
    this.ws.addEventListener("error", (ev) => {
      console.error("[gateway] WebSocket error event:", ev);
    });
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    console.log("[gateway] scheduling reconnect in %dms", delay);
    window.setTimeout(() => this.connect(), delay);
  }

  private flushPending(err: Error) {
    if (this.pending.size > 0) {
      console.log("[gateway] flushing %d pending requests:", this.pending.size, err.message);
    }
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private async sendConnect() {
    if (this.connectSent) {
      console.log("[gateway] sendConnect() skipped — already sent");
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    // crypto.subtle is only available in secure contexts (HTTPS, localhost).
    // Over plain HTTP, we skip device identity and fall back to token-only auth.
    // Gateways may reject this unless gateway.controlUi.allowInsecureAuth is enabled.
    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;
    console.log(
      "[gateway] sendConnect() isSecureContext=%s crypto=%s crypto.subtle=%s",
      isSecureContext,
      typeof crypto !== "undefined",
      typeof crypto !== "undefined" && !!crypto.subtle,
    );

    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
    const role = "operator";
    let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
    let canFallbackToShared = false;
    let authToken = this.opts.token;

    if (isSecureContext) {
      try {
        console.log("[gateway] loading device identity...");
        deviceIdentity = await loadOrCreateDeviceIdentity();
        console.log("[gateway] device identity loaded: deviceId=%s", deviceIdentity.deviceId);
        const storedToken = loadDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role,
        })?.token;
        console.log("[gateway] stored device token: %s", storedToken ? "(present)" : "(none)");
        authToken = storedToken ?? this.opts.token;
        canFallbackToShared = Boolean(storedToken && this.opts.token);
      } catch (err) {
        console.error("[gateway] device identity FAILED, falling back to token auth:", err);
        deviceIdentity = null;
      }
    } else {
      console.log("[gateway] NOT secure context — skipping device identity");
    }

    console.log(
      "[gateway] auth: token=%s password=%s",
      authToken ? "(present)" : "(none)",
      this.opts.password ? "(present)" : "(none)",
    );

    const auth =
      authToken || this.opts.password
        ? {
            token: authToken,
            password: this.opts.password,
          }
        : undefined;

    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string | undefined;
        }
      | undefined;

    if (isSecureContext && deviceIdentity) {
      try {
        const signedAtMs = Date.now();
        const nonce = this.connectNonce ?? undefined;
        console.log("[gateway] signing device payload nonce=%s", nonce ?? "(none)");
        const payload = buildDeviceAuthPayload({
          deviceId: deviceIdentity.deviceId,
          clientId: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.CONTROL_UI,
          clientMode: this.opts.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
          role,
          scopes,
          signedAtMs,
          token: authToken ?? null,
          nonce,
        });
        const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
        device = {
          id: deviceIdentity.deviceId,
          publicKey: deviceIdentity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce,
        };
        console.log("[gateway] device payload signed OK deviceId=%s", device.id);
      } catch (err) {
        console.error("[gateway] device signing FAILED:", err);
        device = undefined;
      }
    } else {
      console.log(
        "[gateway] skipping device signing (isSecure=%s, hasIdentity=%s)",
        isSecureContext,
        !!deviceIdentity,
      );
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.CONTROL_UI,
        version: this.opts.clientVersion ?? "dev",
        platform: this.opts.platform ?? navigator.platform ?? "web",
        mode: this.opts.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
        instanceId: this.opts.instanceId,
      },
      role,
      scopes,
      device,
      caps: [],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    console.log(
      "[gateway] sending connect request: clientId=%s device=%s auth=%s",
      params.client.id,
      device ? device.id : "(none)",
      auth?.token ? "token" : auth?.password ? "password" : "none",
    );

    void this.request<GatewayHelloOk>("connect", params)
      .then((hello) => {
        console.log(
          "[gateway] connect SUCCESS! protocol=%d auth.deviceToken=%s",
          hello?.protocol,
          hello?.auth?.deviceToken ? "(present)" : "(none)",
        );
        if (hello?.auth?.deviceToken && deviceIdentity) {
          storeDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role: hello.auth.role ?? role,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          });
          console.log("[gateway] stored device token for future connections");
        }
        this.backoffMs = 800;
        try {
          this.opts.onHello?.(hello);
          console.log("[gateway] onHello callback completed OK");
        } catch (err) {
          console.error("[gateway] onHello callback THREW:", err);
          throw err;
        }
      })
      .catch((err) => {
        console.error("[gateway] connect FAILED:", err);
        console.error(
          "[gateway] connect FAILED details: message=%s stack=%s",
          err?.message,
          err?.stack,
        );
        if (canFallbackToShared && deviceIdentity) {
          console.log("[gateway] clearing device token for fallback");
          clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role });
        }
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[gateway] unparseable message:", raw.slice(0, 200));
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        console.log("[gateway] got connect.challenge nonce=%s", nonce ?? "(none)");
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      const seq = typeof evt.seq === "number" ? evt.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }
      try {
        this.opts.onEvent?.(evt);
      } catch (err) {
        console.error("[gateway] event handler error:", err);
      }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      console.log(
        "[gateway] response id=%s ok=%s error=%s",
        res.id,
        res.ok,
        res.error?.message ?? "(none)",
      );
      const pending = this.pending.get(res.id);
      if (!pending) {
        console.warn("[gateway] response for unknown request id=%s", res.id);
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "request failed"));
      }
      return;
    }

    console.warn("[gateway] unknown frame type:", (frame as { type?: unknown }).type);
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = generateUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
    }
    console.log("[gateway] queueConnect() → waiting 750ms for challenge nonce");
    this.connectTimer = window.setTimeout(() => {
      console.log("[gateway] connect timer fired — sending connect without challenge");
      void this.sendConnect();
    }, 750);
  }
}
