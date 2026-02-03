type ScrollHost = {
  updateComplete: Promise<unknown>;
  querySelector: (selectors: string) => Element | null;
  style: CSSStyleDeclaration;
  chatScrollFrame: number | null;
  chatScrollTimeout: number | null;
  chatHasAutoScrolled: boolean;
  chatUserNearBottom: boolean;
  chatUserScrolledAway: boolean; // true when user intentionally scrolled up
  logsScrollFrame: number | null;
  logsAtBottom: boolean;
  topbarObserver: ResizeObserver | null;
};

export function scheduleChatScroll(host: ScrollHost, force = false, paneId?: string) {
  if (host.chatScrollFrame) cancelAnimationFrame(host.chatScrollFrame);
  if (host.chatScrollTimeout != null) {
    clearTimeout(host.chatScrollTimeout);
    host.chatScrollTimeout = null;
  }
  // Capture paneId in closure so it survives async gaps
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
      if (canScroll) return scope;
    }
    return (document.scrollingElement ?? document.documentElement) as HTMLElement | null;
  };
  // Wait for Lit render to complete, then scroll
  void host.updateComplete.then(() => {
    host.chatScrollFrame = requestAnimationFrame(() => {
      host.chatScrollFrame = null;
      const target = pickScrollTarget();
      if (!target) return;
      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      // Respect user scroll intent: don't autoscroll if user has scrolled away
      // force=true overrides on initial load, but respects user intent after
      const forceOnInitial = force && !host.chatHasAutoScrolled;
      const shouldStick =
        forceOnInitial ||
        (!host.chatUserScrolledAway && (host.chatUserNearBottom || distanceFromBottom < 200));
      if (!shouldStick) return;
      if (force) host.chatHasAutoScrolled = true;
      // Smooth for small jumps, instant for large ones (initial load, history swap)
      const behavior = distanceFromBottom > 800 ? ("instant" as const) : ("smooth" as const);
      target.scrollTo({ top: target.scrollHeight, behavior });
      // Only mark as near bottom if user hasn't scrolled away
      if (!host.chatUserScrolledAway) {
        host.chatUserNearBottom = true;
      }
      const retryDelay = force ? 150 : 120;
      host.chatScrollTimeout = window.setTimeout(() => {
        host.chatScrollTimeout = null;
        const latest = pickScrollTarget();
        if (!latest) return;
        const latestDistanceFromBottom =
          latest.scrollHeight - latest.scrollTop - latest.clientHeight;
        // Respect user scroll intent on retry too (force only on initial load)
        const forceOnInitialRetry = force && !host.chatHasAutoScrolled;
        const shouldStickRetry =
          forceOnInitialRetry ||
          (!host.chatUserScrolledAway &&
            (host.chatUserNearBottom || latestDistanceFromBottom < 200));
        if (!shouldStickRetry) return;
        // Retry is always instant (just a small correction)
        latest.scrollTop = latest.scrollHeight;
        if (!host.chatUserScrolledAway) {
          host.chatUserNearBottom = true;
        }
      }, retryDelay);
    });
  });
}

export function scheduleLogsScroll(host: ScrollHost, force = false) {
  if (host.logsScrollFrame) cancelAnimationFrame(host.logsScrollFrame);
  void host.updateComplete.then(() => {
    host.logsScrollFrame = requestAnimationFrame(() => {
      host.logsScrollFrame = null;
      const container = host.querySelector(".log-stream") as HTMLElement | null;
      if (!container) return;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick = force || distanceFromBottom < 80;
      if (!shouldStick) return;
      container.scrollTop = container.scrollHeight;
    });
  });
}

export function handleChatScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

  const wasNearBottom = host.chatUserNearBottom;
  host.chatUserNearBottom = distanceFromBottom < 200;

  // User scrolled away from bottom → pause autoscroll
  if (wasNearBottom && !host.chatUserNearBottom) {
    host.chatUserScrolledAway = true;
  }

  // User scrolled back to bottom → resume autoscroll
  if (host.chatUserNearBottom && host.chatUserScrolledAway) {
    host.chatUserScrolledAway = false;
  }
}

export function handleLogsScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.logsAtBottom = distanceFromBottom < 80;
}

export function resetChatScroll(host: ScrollHost) {
  host.chatHasAutoScrolled = false;
  host.chatUserNearBottom = true;
  host.chatUserScrolledAway = false; // Reset on thread switch
}

/**
 * Schedule a scroll for a specific pane in split-pane mode.
 * Scopes the scroll target to [data-pane-id="..."] .chat-thread.
 */
export function schedulePaneChatScroll(host: ScrollHost, paneId: string, force = false) {
  scheduleChatScroll(host, force, paneId);
}

export function scrollAllVisibleChats(host: ScrollHost) {
  void host.updateComplete.then(() => {
    requestAnimationFrame(() => {
      const threads = (host as unknown as ParentNode).querySelectorAll(".chat-thread");
      for (const thread of threads) {
        const distanceFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
        if (distanceFromBottom < 200) {
          thread.scrollTop = thread.scrollHeight;
        }
      }
    });
  });
}

export function exportLogs(lines: string[], label: string) {
  if (lines.length === 0) return;
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
  if (typeof ResizeObserver === "undefined") return;
  const topbar = host.querySelector(".topbar");
  if (!topbar) return;
  const update = () => {
    const { height } = topbar.getBoundingClientRect();
    host.style.setProperty("--topbar-height", `${height}px`);
  };
  update();
  host.topbarObserver = new ResizeObserver(() => update());
  host.topbarObserver.observe(topbar);
}
