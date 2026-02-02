const DEFAULT_PORTS = [18792]

function parsePorts(value) {
  const raw = String(value || '')
  const ports = raw
    .split(/[\s,]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 65535)
  return ports.length > 0 ? ports : [...DEFAULT_PORTS]
}

function updateRelayUrls(ports) {
  const el = document.getElementById('relay-urls')
  if (!el) return
  el.textContent = ports.map((p) => `http://127.0.0.1:${p}/`).join('\n')
}

function setStatus(kind, message) {
  const status = document.getElementById('status')
  if (!status) return
  status.dataset.kind = kind || ''
  status.textContent = message || ''
}

async function checkRelayReachable(port) {
  const url = `http://127.0.0.1:${port}/`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 900)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { port, ok: true }
  } catch {
    return { port, ok: false }
  } finally {
    clearTimeout(t)
  }
}

async function checkAllRelays(ports) {
  const results = await Promise.all(ports.map(checkRelayReachable))
  const reachable = results.filter((r) => r.ok).map((r) => r.port)
  const unreachable = results.filter((r) => !r.ok).map((r) => r.port)

  if (reachable.length === ports.length) {
    setStatus('ok', `All relays reachable: ${reachable.map((p) => `:${p}`).join(', ')}`)
  } else if (reachable.length > 0) {
    setStatus(
      'ok',
      `Reachable: ${reachable.map((p) => `:${p}`).join(', ')}` +
        ` · Not reachable: ${unreachable.map((p) => `:${p}`).join(', ')}`,
    )
  } else {
    setStatus(
      'error',
      `No relays reachable (${unreachable.map((p) => `:${p}`).join(', ')}). Start OpenClaw, then click the toolbar button.`,
    )
  }
}

async function load() {
  const stored = await chrome.storage.local.get(['relayPort', 'relayPorts'])
  let ports
  if (Array.isArray(stored.relayPorts) && stored.relayPorts.length > 0) {
    ports = parsePorts(stored.relayPorts.join(', '))
  } else {
    ports = parsePorts(stored.relayPort)
  }
  document.getElementById('ports').value = ports.join(', ')
  updateRelayUrls(ports)
  await checkAllRelays(ports)
}

async function save() {
  const input = document.getElementById('ports')
  const ports = parsePorts(input.value)
  // Store both formats for backward compat
  await chrome.storage.local.set({
    relayPorts: ports,
    relayPort: ports[0],
  })
  input.value = ports.join(', ')
  updateRelayUrls(ports)
  await checkAllRelays(ports)
}

document.getElementById('save').addEventListener('click', () => void save())
void load()
