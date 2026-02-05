import type {
  GatewayEventFrame,
  GatewayResponseFrame,
  GatewayHelloOk,
  GatewayClientOptions,
  GatewayCdpFrame,
  GatewayBrowserInfoFrame,
  Pending,
} from "./types";
import { useBrowserStore } from "../stores/browser-store";
import { usePanelStore } from "../stores/panel-store";
import { useProjectStore } from "../stores/project-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from "./device-auth";
import { buildDeviceAuthPayload } from "./device-auth-payload";
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity";

// Generate a simple UUID for request IDs
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 4008 = application-defined close code
const CONNECT_FAILED_CLOSE_CODE = 4008;

const CLIENT_ID = "kos";
const CLIENT_MODE = "webchat";
const CLIENT_VERSION = "0.1.0";
const ROLE = "operator";
const SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"];
const CAPS = ["browser", "terminal"]; // Advertise browser and terminal capabilities
const COMMANDS = [
  "terminal.spawn",
  "terminal.exec",
  "terminal.read",
  "terminal.copy",
  "terminal.close",
  "terminal.list",
]; // Commands this node can handle

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;
  private browserStoreUnsub: (() => void) | null = null;

  constructor(private opts: GatewayClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.browserStoreUnsub?.();
    this.browserStoreUnsub = null;
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
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason });
      this.scheduleReconnect();
    });
    this.ws.addEventListener("error", () => {
      // ignored; close handler will fire
    });
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    setTimeout(() => {
      this.connect();
      this.opts.onReconnect?.();
    }, delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private async sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;

    let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
    let canFallbackToShared = false;
    let authToken = this.opts.token;

    if (isSecureContext) {
      deviceIdentity = await loadOrCreateDeviceIdentity();
      const storedToken = loadDeviceAuthToken({
        deviceId: deviceIdentity.deviceId,
        role: ROLE,
      })?.token;
      authToken = storedToken ?? this.opts.token;
      canFallbackToShared = Boolean(storedToken && this.opts.token);
    }

    const auth = authToken
      ? {
          token: authToken,
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
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId: CLIENT_ID,
        clientMode: CLIENT_MODE,
        role: ROLE,
        scopes: SCOPES,
        signedAtMs,
        token: authToken ?? null,
        nonce,
        version: nonce ? "v2" : "v1",
      });
      const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
      device = {
        id: deviceIdentity.deviceId,
        publicKey: deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: CLIENT_ID,
        version: CLIENT_VERSION,
        platform: navigator.platform,
        mode: CLIENT_MODE,
      },
      role: ROLE,
      scopes: SCOPES,
      caps: CAPS,
      commands: COMMANDS,
      device,
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    try {
      const hello = await this.request<GatewayHelloOk>("connect", params);
      if (hello?.auth?.deviceToken && deviceIdentity) {
        storeDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role: hello.auth.role ?? ROLE,
          token: hello.auth.deviceToken,
          scopes: hello.auth.scopes ?? [],
        });
      }
      this.backoffMs = 800;
      this.subscribeToBrowserStore();
      this.opts.onHello?.(hello);
    } catch (err) {
      if (canFallbackToShared && deviceIdentity) {
        clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role: ROLE });
      }
      console.error("[gateway] connect failed:", err);
      this.ws?.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
    }
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      // Handle node.invoke.request events for terminal commands
      if (evt.event === "node.invoke.request") {
        void this.handleNodeInvokeRequest(evt.payload);
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
      const pending = this.pending.get(res.id);
      if (!pending) {
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

    // Handle CDP messages from gateway
    if (frame.type === "cdp") {
      const cdp = parsed as GatewayCdpFrame;
      void this.handleCdpCommand(cdp);
      return;
    }
  }

  private async handleCdpCommand(cdp: GatewayCdpFrame) {
    try {
      const result = await window.api.browser.cdp(cdp.method, cdp.params);
      this.send({ type: "cdp-response", id: cdp.id, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.send({ type: "cdp-response", id: cdp.id, error });
    }
  }

  private async handleNodeInvokeRequest(payload: unknown) {
    if (!payload || typeof payload !== "object") return;

    const req = payload as {
      id: string;
      nodeId: string;
      command: string;
      paramsJSON?: string | null;
      timeoutMs?: number;
    };

    const params = req.paramsJSON ? JSON.parse(req.paramsJSON) : {};

    const sendResult = (ok: boolean, resultPayload?: unknown, error?: string) => {
      this.request("node.invoke.result", {
        id: req.id,
        nodeId: req.nodeId,
        ok,
        payload: resultPayload,
        error: error ? { message: error } : null,
      }).catch(console.error);
    };

    try {
      switch (req.command) {
        case "terminal.spawn": {
          const result = await window.api.terminal.createManaged(params.cwd);
          // Open a terminal panel for the managed terminal
          const projectId = useProjectStore.getState().activeProjectId;
          if (projectId) {
            const activeWorkspaceByProject = useWorkspaceStore.getState().activeWorkspaceByProject;
            const workspaceId = activeWorkspaceByProject.get(projectId);
            if (workspaceId) {
              usePanelStore.getState().openManagedTerminal(workspaceId, result.id, params.cwd);
            }
          }
          sendResult(true, { terminalId: result.id, pid: result.pid });
          break;
        }
        case "terminal.exec": {
          const result = await window.api.terminal.execManaged(
            params.terminalId,
            params.command,
            params.timeoutMs,
          );
          sendResult(true, result);
          break;
        }
        case "terminal.read": {
          const output = await window.api.terminal.readManaged(
            params.terminalId,
            params.since,
            params.maxBytes,
          );
          sendResult(true, { output });
          break;
        }
        case "terminal.close": {
          await window.api.terminal.closeManaged(params.terminalId, params.force);
          sendResult(true, { closed: true });
          break;
        }
        case "terminal.copy": {
          const result = await window.api.terminal.copyManaged(params.terminalId);
          sendResult(true, result);
          break;
        }
        case "terminal.list": {
          const terminals = await window.api.terminal.listManaged();
          sendResult(true, { terminals });
          break;
        }
        default:
          sendResult(false, undefined, `Unknown command: ${req.command}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      sendResult(false, undefined, error);
    }
  }

  private subscribeToBrowserStore() {
    // Clean up any existing subscription
    this.browserStoreUnsub?.();

    // Send current browser state immediately
    this.sendBrowserInfo();

    // Subscribe to future changes
    this.browserStoreUnsub = useBrowserStore.subscribe((state, prevState) => {
      if (state.cdpUrl !== prevState.cdpUrl || state.isActive !== prevState.isActive) {
        this.sendBrowserInfo();
      }
    });
  }

  private sendBrowserInfo() {
    const { cdpUrl, isActive } = useBrowserStore.getState();
    const frame: GatewayBrowserInfoFrame = {
      type: "browser-info",
      cdpUrl,
      isActive,
    };
    this.send(frame);
  }

  private send(frame: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
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
      clearTimeout(this.connectTimer);
    }
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, 750);
  }
}
