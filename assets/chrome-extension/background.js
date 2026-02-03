const DEFAULT_PORTS = [18792]

const BADGE = {
  on: { text: 'ON', color: '#FF5A36' },
  off: { text: '', color: '#000000' },
  connecting: { text: '…', color: '#F59E0B' },
  error: { text: '!', color: '#B91C1C' },
}

// ── Per-relay state ──────────────────────────────────────────────────
// Each relay port gets its own WebSocket and pending-response map.
// Tabs are shared across all relays.

/** @type {Map<number, {ws: WebSocket|null, connectPromise: Promise<void>|null, pending: Map<number, {resolve:(v:any)=>void, reject:(e:Error)=>void}>}>} */
const relays = new Map()

// ── Shared tab state ─────────────────────────────────────────────────

let debuggerListenersInstalled = false
let nextSession = 1

/** @type {Map<number, {state:'connecting'|'connected', sessionId?:string, targetId?:string, attachOrder?:number, targetInfo?:any}>} */
const tabs = new Map()
/** @type {Map<string, number>} */
const tabBySession = new Map()
/** @type {Map<string, number>} */
const childSessionToTab = new Map()

// ── Helpers ──────────────────────────────────────────────────────────

function nowStack() {
  try {
    return new Error().stack || ''
  } catch {
    return ''
  }
}

async function getRelayPorts() {
  const stored = await chrome.storage.local.get(['relayPort', 'relayPorts'])
  // Prefer relayPorts array (new format)
  if (Array.isArray(stored.relayPorts) && stored.relayPorts.length > 0) {
    const ports = stored.relayPorts
      .map((p) => Number.parseInt(String(p), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 65535)
    if (ports.length > 0) return ports
  }
  // Backward compat: single relayPort
  const n = Number.parseInt(String(stored.relayPort || ''), 10)
  if (Number.isFinite(n) && n > 0 && n <= 65535) return [n]
  return [...DEFAULT_PORTS]
}

function getRelay(port) {
  let r = relays.get(port)
  if (!r) {
    r = { ws: null, connectPromise: null, pending: new Map() }
    relays.set(port, r)
  }
  return r
}

function setBadge(tabId, kind) {
  const cfg = BADGE[kind]
  void chrome.action.setBadgeText({ tabId, text: cfg.text })
  void chrome.action.setBadgeBackgroundColor({ tabId, color: cfg.color })
  void chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }).catch(() => {})
}

function sendToRelay(relay, payload) {
  const ws = relay.ws
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('Relay not connected')
  }
  ws.send(JSON.stringify(payload))
}

/** Send a payload to every connected relay. */
function broadcastToAllRelays(payload) {
  const msg = JSON.stringify(payload)
  for (const relay of relays.values()) {
    if (relay.ws && relay.ws.readyState === WebSocket.OPEN) {
      try {
        relay.ws.send(msg)
      } catch {
        // ignore – relay will be cleaned up on close
      }
    }
  }
}

/** True if at least one relay WebSocket is open. */
function anyRelayConnected() {
  for (const relay of relays.values()) {
    if (relay.ws && relay.ws.readyState === WebSocket.OPEN) return true
  }
  return false
}

async function maybeOpenHelpOnce() {
  try {
    const stored = await chrome.storage.local.get(['helpOnErrorShown'])
    if (stored.helpOnErrorShown === true) return
    await chrome.storage.local.set({ helpOnErrorShown: true })
    await chrome.runtime.openOptionsPage()
  } catch {
    // ignore
  }
}

// ── Relay connections ────────────────────────────────────────────────

async function ensureRelayConnection(port) {
  const relay = getRelay(port)
  if (relay.ws && relay.ws.readyState === WebSocket.OPEN) return
  if (relay.connectPromise) return await relay.connectPromise

  relay.connectPromise = (async () => {
    const httpBase = `http://127.0.0.1:${port}`
    const wsUrl = `ws://127.0.0.1:${port}/extension`

    // Fast preflight: is the relay server up?
    try {
      await fetch(`${httpBase}/`, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
    } catch (err) {
      throw new Error(`Relay server not reachable at ${httpBase} (${String(err)})`)
    }

    const ws = new WebSocket(wsUrl)
    relay.ws = ws

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebSocket connect timeout')), 5000)
      ws.onopen = () => {
        clearTimeout(t)
        resolve()
      }
      ws.onerror = () => {
        clearTimeout(t)
        reject(new Error('WebSocket connect failed'))
      }
      ws.onclose = (ev) => {
        clearTimeout(t)
        reject(new Error(`WebSocket closed (${ev.code} ${ev.reason || 'no reason'})`))
      }
    })

    ws.onmessage = (event) => void onRelayMessage(port, String(event.data || ''))
    ws.onclose = () => onRelayClosed(port, 'closed')
    ws.onerror = () => onRelayClosed(port, 'error')

    if (!debuggerListenersInstalled) {
      debuggerListenersInstalled = true
      chrome.debugger.onEvent.addListener(onDebuggerEvent)
      chrome.debugger.onDetach.addListener(onDebuggerDetach)
    }

    // Announce any already-attached tabs to the newly connected relay
    announceExistingTabsToRelay(relay)
  })()

  try {
    await relay.connectPromise
  } finally {
    relay.connectPromise = null
  }
}

/** When a relay (re)connects, replay Target.attachedToTarget for every attached tab. */
function announceExistingTabsToRelay(relay) {
  for (const tab of tabs.values()) {
    if (tab.state !== 'connected' || !tab.sessionId || !tab.targetId) continue
    try {
      sendToRelay(relay, {
        method: 'forwardCDPEvent',
        params: {
          method: 'Target.attachedToTarget',
          params: {
            sessionId: tab.sessionId,
            targetInfo: tab.targetInfo
              ? { ...tab.targetInfo, attached: true }
              : { targetId: tab.targetId, type: 'page', attached: true },
            waitingForDebugger: false,
          },
        },
      })
    } catch {
      // ignore – will be handled on next command
    }
  }
}

/**
 * Connect to all configured relay ports. Succeeds if at least one connects.
 * Non-reachable ports are silently skipped.
 */
async function ensureAllRelayConnections() {
  const ports = await getRelayPorts()
  const results = await Promise.allSettled(ports.map((p) => ensureRelayConnection(p)))
  const anySuccess = results.some((r) => r.status === 'fulfilled')
  if (!anySuccess) {
    const errors = results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.message || String(r.reason))
    throw new Error(`No relay servers reachable: ${errors.join('; ')}`)
  }
}

function onRelayClosed(port, reason) {
  const relay = getRelay(port)
  relay.ws = null

  // Reject any pending requests for this relay
  for (const [id, p] of relay.pending.entries()) {
    relay.pending.delete(id)
    p.reject(new Error(`Relay :${port} disconnected (${reason})`))
  }

  // Only tear down tabs if NO relays remain connected
  if (!anyRelayConnected()) {
    for (const tabId of tabs.keys()) {
      void chrome.debugger.detach({ tabId }).catch(() => {})
      setBadge(tabId, 'connecting')
      void chrome.action.setTitle({
        tabId,
        title: 'OpenClaw Browser Relay: all relays disconnected (click to re-attach)',
      })
    }
    tabs.clear()
    tabBySession.clear()
    childSessionToTab.clear()
  }
}

// ── Relay message handling ───────────────────────────────────────────

async function onRelayMessage(port, text) {
  const relay = getRelay(port)
  /** @type {any} */
  let msg
  try {
    msg = JSON.parse(text)
  } catch {
    return
  }

  // Ping/pong keepalive
  if (msg && msg.method === 'ping') {
    try {
      sendToRelay(relay, { method: 'pong' })
    } catch {
      // ignore
    }
    return
  }

  // Response to a request we made to the relay (currently unused, kept for future)
  if (msg && typeof msg.id === 'number' && (msg.result !== undefined || msg.error !== undefined)) {
    const p = relay.pending.get(msg.id)
    if (!p) return
    relay.pending.delete(msg.id)
    if (msg.error) p.reject(new Error(String(msg.error)))
    else p.resolve(msg.result)
    return
  }

  // CDP command the relay wants us to forward to a tab
  if (msg && typeof msg.id === 'number' && msg.method === 'forwardCDPCommand') {
    try {
      const result = await handleForwardCdpCommand(msg)
      sendToRelay(relay, { id: msg.id, result })
    } catch (err) {
      sendToRelay(relay, { id: msg.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

// ── Tab routing ──────────────────────────────────────────────────────

function getTabBySessionId(sessionId) {
  const direct = tabBySession.get(sessionId)
  if (direct) return { tabId: direct, kind: 'main' }
  const child = childSessionToTab.get(sessionId)
  if (child) return { tabId: child, kind: 'child' }
  return null
}

function getTabByTargetId(targetId) {
  for (const [tabId, tab] of tabs.entries()) {
    if (tab.targetId === targetId) return tabId
  }
  return null
}

// ── Tab attach / detach ──────────────────────────────────────────────

async function attachTab(tabId, opts = {}) {
  const debuggee = { tabId }
  await chrome.debugger.attach(debuggee, '1.3')
  await chrome.debugger.sendCommand(debuggee, 'Page.enable').catch(() => {})

  const info = /** @type {any} */ (await chrome.debugger.sendCommand(debuggee, 'Target.getTargetInfo'))
  const targetInfo = info?.targetInfo
  const targetId = String(targetInfo?.targetId || '').trim()
  if (!targetId) {
    throw new Error('Target.getTargetInfo returned no targetId')
  }

  const sessionId = `cb-tab-${nextSession++}`
  const attachOrder = nextSession

  tabs.set(tabId, { state: 'connected', sessionId, targetId, attachOrder, targetInfo })
  tabBySession.set(sessionId, tabId)
  void chrome.action.setTitle({
    tabId,
    title: 'OpenClaw Browser Relay: attached (click to detach)',
  })

  // Announce to ALL connected relays
  if (!opts.skipAttachedEvent) {
    broadcastToAllRelays({
      method: 'forwardCDPEvent',
      params: {
        method: 'Target.attachedToTarget',
        params: {
          sessionId,
          targetInfo: { ...targetInfo, attached: true },
          waitingForDebugger: false,
        },
      },
    })
  }

  setBadge(tabId, 'on')
  return { sessionId, targetId }
}

async function detachTab(tabId, reason) {
  const tab = tabs.get(tabId)

  // Announce detach to ALL relays
  if (tab?.sessionId && tab?.targetId) {
    broadcastToAllRelays({
      method: 'forwardCDPEvent',
      params: {
        method: 'Target.detachedFromTarget',
        params: { sessionId: tab.sessionId, targetId: tab.targetId, reason },
      },
    })
  }

  if (tab?.sessionId) tabBySession.delete(tab.sessionId)
  tabs.delete(tabId)

  for (const [childSessionId, parentTabId] of childSessionToTab.entries()) {
    if (parentTabId === tabId) childSessionToTab.delete(childSessionId)
  }

  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    // ignore
  }

  setBadge(tabId, 'off')
  void chrome.action.setTitle({
    tabId,
    title: 'OpenClaw Browser Relay (click to attach/detach)',
  })
}

// ── CDP command forwarding ───────────────────────────────────────────

async function handleForwardCdpCommand(msg) {
  const method = String(msg?.params?.method || '').trim()
  const params = msg?.params?.params || undefined
  const sessionId = typeof msg?.params?.sessionId === 'string' ? msg.params.sessionId : undefined

  // Map command to tab
  const bySession = sessionId ? getTabBySessionId(sessionId) : null
  const targetId = typeof params?.targetId === 'string' ? params.targetId : undefined
  const tabId =
    bySession?.tabId ||
    (targetId ? getTabByTargetId(targetId) : null) ||
    (() => {
      // No sessionId: pick the first connected tab (stable-ish).
      for (const [id, tab] of tabs.entries()) {
        if (tab.state === 'connected') return id
      }
      return null
    })()

  if (!tabId) throw new Error(`No attached tab for method ${method}`)

  /** @type {chrome.debugger.DebuggerSession} */
  const debuggee = { tabId }

  if (method === 'Runtime.enable') {
    try {
      await chrome.debugger.sendCommand(debuggee, 'Runtime.disable')
      await new Promise((r) => setTimeout(r, 50))
    } catch {
      // ignore
    }
    return await chrome.debugger.sendCommand(debuggee, 'Runtime.enable', params)
  }

  if (method === 'Target.createTarget') {
    const url = typeof params?.url === 'string' ? params.url : 'about:blank'
    const tab = await chrome.tabs.create({ url, active: false })
    if (!tab.id) throw new Error('Failed to create tab')
    await new Promise((r) => setTimeout(r, 100))
    const attached = await attachTab(tab.id)
    return { targetId: attached.targetId }
  }

  if (method === 'Target.closeTarget') {
    const target = typeof params?.targetId === 'string' ? params.targetId : ''
    const toClose = target ? getTabByTargetId(target) : tabId
    if (!toClose) return { success: false }
    try {
      await chrome.tabs.remove(toClose)
    } catch {
      return { success: false }
    }
    return { success: true }
  }

  if (method === 'Target.activateTarget') {
    const target = typeof params?.targetId === 'string' ? params.targetId : ''
    const toActivate = target ? getTabByTargetId(target) : tabId
    if (!toActivate) return {}
    const activateTab = await chrome.tabs.get(toActivate).catch(() => null)
    if (!activateTab) return {}
    if (activateTab.windowId) {
      await chrome.windows.update(activateTab.windowId, { focused: true }).catch(() => {})
    }
    await chrome.tabs.update(toActivate, { active: true }).catch(() => {})
    return {}
  }

  const tabState = tabs.get(tabId)
  const mainSessionId = tabState?.sessionId
  const debuggerSession =
    sessionId && mainSessionId && sessionId !== mainSessionId
      ? { ...debuggee, sessionId }
      : debuggee

  return await chrome.debugger.sendCommand(debuggerSession, method, params)
}

// ── Toolbar click ────────────────────────────────────────────────────

async function connectOrToggleForActiveTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = active?.id
  if (!tabId) return

  const existing = tabs.get(tabId)
  if (existing?.state === 'connected') {
    await detachTab(tabId, 'toggle')
    return
  }

  tabs.set(tabId, { state: 'connecting' })
  setBadge(tabId, 'connecting')
  void chrome.action.setTitle({
    tabId,
    title: 'OpenClaw Browser Relay: connecting to relay servers…',
  })

  try {
    await ensureAllRelayConnections()
    await attachTab(tabId)
  } catch (err) {
    tabs.delete(tabId)
    setBadge(tabId, 'error')
    void chrome.action.setTitle({
      tabId,
      title: 'OpenClaw Browser Relay: no relay servers reachable (open options for setup)',
    })
    void maybeOpenHelpOnce()
    const message = err instanceof Error ? err.message : String(err)
    console.warn('attach failed', message, nowStack())
  }
}

// ── Debugger event listeners ─────────────────────────────────────────

function onDebuggerEvent(source, method, params) {
  const tabId = source.tabId
  if (!tabId) return
  const tab = tabs.get(tabId)
  if (!tab?.sessionId) return

  if (method === 'Target.attachedToTarget' && params?.sessionId) {
    childSessionToTab.set(String(params.sessionId), tabId)
  }

  if (method === 'Target.detachedFromTarget' && params?.sessionId) {
    childSessionToTab.delete(String(params.sessionId))
  }

  // Broadcast CDP events to ALL relays
  broadcastToAllRelays({
    method: 'forwardCDPEvent',
    params: {
      sessionId: source.sessionId || tab.sessionId,
      method,
      params,
    },
  })
}

function onDebuggerDetach(source, reason) {
  const tabId = source.tabId
  if (!tabId) return
  if (!tabs.has(tabId)) return
  void detachTab(tabId, reason)
}

// ── Lifecycle ────────────────────────────────────────────────────────

chrome.action.onClicked.addListener(() => void connectOrToggleForActiveTab())

chrome.runtime.onInstalled.addListener(() => {
  // Useful: first-time instructions.
  void chrome.runtime.openOptionsPage()
})
