/** Distance (px) from the bottom within which we consider the user "near bottom". */
const NEAR_BOTTOM_THRESHOLD = 450;

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
};

export function scheduleChatScroll(
  host: ScrollHost,
  force = false,
  paneId?: string,
  smooth = false,
) {
  if (host.chatScrollFrame) {
    cancelAnimationFrame(host.chatScrollFrame);
  }
  if (host.chatScrollTimeout != null) {
    clearTimeout(host.chatScrollTimeout);
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

  void host.updateComplete.then(() => {
    host.chatScrollFrame = requestAnimationFrame(() => {
      host.chatScrollFrame = null;
      const target = pickScrollTarget();
      if (!target) {
        return;
      }

      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      const effectiveForce = force && !host.chatHasAutoScrolled;
      const shouldStick =
        effectiveForce ||
        (!host.chatUserScrolledAway &&
          (host.chatUserNearBottom || distanceFromBottom < NEAR_BOTTOM_THRESHOLD));

      if (!shouldStick) {
        host.chatNewMessagesBelow = true;
        return;
      }

      if (effectiveForce) {
        host.chatHasAutoScrolled = true;
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

      host.chatUserNearBottom = true;
      host.chatNewMessagesBelow = false;

      const retryDelay = effectiveForce ? 150 : 120;
      host.chatScrollTimeout = window.setTimeout(() => {
        host.chatScrollTimeout = null;
        const latest = pickScrollTarget();
        if (!latest) {
          return;
        }

        const latestDistanceFromBottom =
          latest.scrollHeight - latest.scrollTop - latest.clientHeight;
        const shouldStickRetry =
          effectiveForce ||
          (!host.chatUserScrolledAway &&
            (host.chatUserNearBottom || latestDistanceFromBottom < NEAR_BOTTOM_THRESHOLD));

        if (!shouldStickRetry) {
          return;
        }

        latest.scrollTop = latest.scrollHeight;
        host.chatUserNearBottom = true;
      }, retryDelay);
    });
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

export function resetChatScroll(host: ScrollHost) {
  host.chatHasAutoScrolled = false;
  host.chatUserNearBottom = true;
  host.chatUserScrolledAway = false;
  host.chatNewMessagesBelow = false;
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
