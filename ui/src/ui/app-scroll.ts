/** Distance (px) from the bottom within which we consider the user "near bottom". */
const NEAR_BOTTOM_THRESHOLD = 450;

/** Per-pane scroll state so each split pane tracks its own scroll position independently. */
export interface PaneScrollState {
  scrollFrame: number | null;
  scrollTimeout: number | null;
  hasAutoScrolled: boolean;
  userNearBottom: boolean;
  userScrolledAway: boolean;
  newMessagesBelow: boolean;
}

export function createPaneScrollState(): PaneScrollState {
  return {
    scrollFrame: null,
    scrollTimeout: null,
    hasAutoScrolled: false,
    userNearBottom: true,
    userScrolledAway: false,
    newMessagesBelow: false,
  };
}

type ScrollHost = {
  updateComplete: Promise<unknown>;
  querySelector: (selectors: string) => Element | null;
  style: CSSStyleDeclaration;
  chatScrollFrame: number | null;
  chatScrollTimeout: number | null;
  chatHasAutoScrolled: boolean;
  chatUserNearBottom: boolean;
  chatUserScrolledAway: boolean;
  chatNewMessagesBelow: boolean;
  logsScrollFrame: number | null;
  logsAtBottom: boolean;
  topbarObserver: ResizeObserver | null;
  /** Per-pane scroll state for split-pane mode. */
  paneScrollStates?: Map<string, PaneScrollState>;
};

function hasSessionPicker(container: unknown): boolean {
  const el = container as { querySelector?: (selector: string) => unknown } | null;
  if (!el || typeof el.querySelector !== "function") {
    return false;
  }
  try {
    return Boolean(el.querySelector(".session-picker"));
  } catch {
    return false;
  }
}

/** Helper: get or create per-pane scroll state. */
function getPaneScroll(host: ScrollHost, paneId: string): PaneScrollState {
  if (!host.paneScrollStates) {
    host.paneScrollStates = new Map();
  }
  let ps = host.paneScrollStates.get(paneId);
  if (!ps) {
    ps = createPaneScrollState();
    host.paneScrollStates.set(paneId, ps);
  }
  return ps;
}

export function scheduleChatScroll(
  host: ScrollHost,
  force = false,
  paneId?: string,
  smooth = false,
) {
  // When paneId is provided, use per-pane scroll state so panes don't interfere.
  const ps = paneId ? getPaneScroll(host, paneId) : null;

  // Cancel pending frame/timeout for this specific scroll context
  const scrollFrame = ps ? ps.scrollFrame : host.chatScrollFrame;
  const scrollTimeout = ps ? ps.scrollTimeout : host.chatScrollTimeout;
  if (scrollFrame) {
    cancelAnimationFrame(scrollFrame);
  }
  if (scrollTimeout != null) {
    clearTimeout(scrollTimeout);
  }
  if (ps) {
    ps.scrollFrame = null;
    ps.scrollTimeout = null;
  } else {
    host.chatScrollFrame = null;
    host.chatScrollTimeout = null;
  }

  const pickScrollTarget = () => {
    const scope = paneId
      ? (host.querySelector(`[data-pane-id="${paneId}"] .chat-thread`) as HTMLElement | null)
      : (host.querySelector(".chat-thread") as HTMLElement | null);
    if (scope) {
      const overflowY = getComputedStyle(scope).overflowY;
      const canScroll =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        scope.scrollHeight - scope.clientHeight > 1;
      if (canScroll) {
        return scope;
      }
    }
    return (document.scrollingElement ?? document.documentElement) as HTMLElement | null;
  };

  // Read scroll state from per-pane or shared host
  const hasAutoScrolled = ps ? ps.hasAutoScrolled : host.chatHasAutoScrolled;
  const userScrolledAway = ps ? ps.userScrolledAway : host.chatUserScrolledAway;
  const userNearBottom = ps ? ps.userNearBottom : host.chatUserNearBottom;

  void host.updateComplete.then(() => {
    const frameId = requestAnimationFrame(() => {
      if (ps) {
        ps.scrollFrame = null;
      } else {
        host.chatScrollFrame = null;
      }
      const target = pickScrollTarget();
      if (paneId) {
        console.debug(
          `[scroll] pane=${paneId} target=${target?.className ?? "null"} force=${force} hasAutoScrolled=${hasAutoScrolled} userScrolledAway=${userScrolledAway} userNearBottom=${userNearBottom}`,
        );
      }
      if (!target) {
        return;
      }

      // New thread / empty pane state: keep the session picker pinned at the top.
      if (hasSessionPicker(target)) {
        if (typeof target.scrollTo === "function") {
          target.scrollTo({ top: 0, behavior: "auto" });
        } else {
          target.scrollTop = 0;
        }
        return;
      }

      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      const effectiveForce = force && !hasAutoScrolled;
      const shouldStick =
        effectiveForce ||
        (!userScrolledAway && (userNearBottom || distanceFromBottom < NEAR_BOTTOM_THRESHOLD));

      if (!shouldStick) {
        if (ps) {
          ps.newMessagesBelow = true;
        } else {
          host.chatNewMessagesBelow = true;
        }
        return;
      }

      if (effectiveForce) {
        if (ps) {
          ps.hasAutoScrolled = true;
        } else {
          host.chatHasAutoScrolled = true;
        }
      }

      const smoothEnabled =
        smooth &&
        (typeof window === "undefined" ||
          typeof window.matchMedia !== "function" ||
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

      if (typeof target.scrollTo === "function") {
        target.scrollTo({ top: target.scrollHeight, behavior: smoothEnabled ? "smooth" : "auto" });
      } else {
        target.scrollTop = target.scrollHeight;
      }

      if (ps) {
        ps.userNearBottom = true;
        ps.newMessagesBelow = false;
      } else {
        host.chatUserNearBottom = true;
        host.chatNewMessagesBelow = false;
      }

      const retryDelay = effectiveForce ? 150 : 120;
      const timeoutId = window.setTimeout(() => {
        if (ps) {
          ps.scrollTimeout = null;
        } else {
          host.chatScrollTimeout = null;
        }
        const latest = pickScrollTarget();
        if (!latest) {
          return;
        }

        const latestDistanceFromBottom =
          latest.scrollHeight - latest.scrollTop - latest.clientHeight;
        const retryUserScrolledAway = ps ? ps.userScrolledAway : host.chatUserScrolledAway;
        const retryUserNearBottom = ps ? ps.userNearBottom : host.chatUserNearBottom;
        const shouldStickRetry =
          effectiveForce ||
          (!retryUserScrolledAway &&
            (retryUserNearBottom || latestDistanceFromBottom < NEAR_BOTTOM_THRESHOLD));

        if (!shouldStickRetry) {
          return;
        }

        latest.scrollTop = latest.scrollHeight;
        if (ps) {
          ps.userNearBottom = true;
        } else {
          host.chatUserNearBottom = true;
        }
      }, retryDelay);

      if (ps) {
        ps.scrollTimeout = timeoutId;
      } else {
        host.chatScrollTimeout = timeoutId;
      }
    });

    if (ps) {
      ps.scrollFrame = frameId;
    } else {
      host.chatScrollFrame = frameId;
    }
  });
}

export function scheduleLogsScroll(host: ScrollHost, force = false) {
  if (host.logsScrollFrame) {
    cancelAnimationFrame(host.logsScrollFrame);
  }
  void host.updateComplete.then(() => {
    host.logsScrollFrame = requestAnimationFrame(() => {
      host.logsScrollFrame = null;
      const container = host.querySelector(".log-stream") as HTMLElement | null;
      if (!container) {
        return;
      }
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick = force || distanceFromBottom < 80;
      if (!shouldStick) {
        return;
      }
      container.scrollTop = container.scrollHeight;
    });
  });
}

export function handleChatScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) {
    return;
  }

  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

  // Detect which pane this scroll event belongs to and update per-pane state
  const paneEl =
    typeof container.closest === "function" ? container.closest("[data-pane-id]") : null;
  const paneId = paneEl?.dataset?.paneId;
  const ps = paneId ? getPaneScroll(host, paneId) : null;

  if (ps) {
    const wasNearBottom = ps.userNearBottom;
    ps.userNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    if (wasNearBottom && !ps.userNearBottom) {
      ps.userScrolledAway = true;
    }
    if (ps.userNearBottom) {
      ps.userScrolledAway = false;
      ps.newMessagesBelow = false;
    }
  }

  // Also update shared state (for single-pane mode and backwards compat)
  const wasNearBottom = host.chatUserNearBottom;
  host.chatUserNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;

  if (wasNearBottom && !host.chatUserNearBottom) {
    host.chatUserScrolledAway = true;
  }

  if (host.chatUserNearBottom) {
    host.chatUserScrolledAway = false;
    host.chatNewMessagesBelow = false;
  }
}

export function handleLogsScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) {
    return;
  }
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.logsAtBottom = distanceFromBottom < 80;
}

export function resetChatScroll(host: ScrollHost, paneId?: string) {
  host.chatHasAutoScrolled = false;
  host.chatUserNearBottom = true;
  host.chatUserScrolledAway = false;
  host.chatNewMessagesBelow = false;
  // Also reset per-pane state if applicable
  if (paneId && host.paneScrollStates) {
    const ps = host.paneScrollStates.get(paneId);
    if (ps) {
      ps.hasAutoScrolled = false;
      ps.userNearBottom = true;
      ps.userScrolledAway = false;
      ps.newMessagesBelow = false;
    }
  }
  // When no specific paneId, reset all pane states
  if (!paneId && host.paneScrollStates) {
    for (const ps of host.paneScrollStates.values()) {
      ps.hasAutoScrolled = false;
      ps.userNearBottom = true;
      ps.userScrolledAway = false;
      ps.newMessagesBelow = false;
    }
  }
}

/**
 * Schedule a scroll for a specific pane in split-pane mode.
 * Scopes the scroll target to [data-pane-id="..."] .chat-thread.
 */
export function schedulePaneChatScroll(
  host: ScrollHost,
  paneId: string,
  force = false,
  smooth = false,
) {
  scheduleChatScroll(host, force, paneId, smooth);
}

export function scrollAllVisibleChats(host: ScrollHost) {
  void host.updateComplete.then(() => {
    requestAnimationFrame(() => {
      const threads = (host as unknown as ParentNode).querySelectorAll(".chat-thread");
      for (const thread of threads) {
        if (hasSessionPicker(thread)) {
          continue;
        }
        const distanceFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
        if (distanceFromBottom < NEAR_BOTTOM_THRESHOLD) {
          thread.scrollTop = thread.scrollHeight;
        }
      }
    });
  });
}

export function exportLogs(lines: string[], label: string) {
  if (lines.length === 0) {
    return;
  }
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `openclaw-logs-${label}-${stamp}.log`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function observeTopbar(host: ScrollHost) {
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  const topbar = host.querySelector(".topbar");
  if (!topbar) {
    return;
  }
  const update = () => {
    const { height } = topbar.getBoundingClientRect();
    host.style.setProperty("--topbar-height", `${height}px`);
  };
  update();
  host.topbarObserver = new ResizeObserver(() => update());
  host.topbarObserver.observe(topbar);
}
