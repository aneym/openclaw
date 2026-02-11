import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agent/concurrency");

const DEFAULT_MAX_CONCURRENT_TURNS = 10;

type WaitingTurn = {
  resolve: (release: () => void) => void;
  enqueuedAt: number;
  label?: string;
};

const resolveTurnLimit = (config?: OpenClawConfig): number => {
  const configured = config?.agents?.defaults?.maxConcurrentTurns;
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_CONCURRENT_TURNS;
  }
  return Math.max(1, Math.floor(configured));
};

class AgentTurnSemaphore {
  private activeTurns = 0;
  private waitingTurns: WaitingTurn[] = [];
  private limit = DEFAULT_MAX_CONCURRENT_TURNS;

  private refreshLimit(config?: OpenClawConfig) {
    this.limit = resolveTurnLimit(config);
  }

  private createRelease() {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.activeTurns = Math.max(0, this.activeTurns - 1);
      this.pump();
    };
  }

  private pump() {
    while (this.activeTurns < this.limit && this.waitingTurns.length > 0) {
      const queued = this.waitingTurns.shift() as WaitingTurn;
      const waitedMs = Date.now() - queued.enqueuedAt;
      this.activeTurns += 1;
      queued.resolve(this.createRelease());
      log.debug(
        `agent turn dequeued: waitedMs=${waitedMs} active=${this.activeTurns} queued=${this.waitingTurns.length} limit=${this.limit}${queued.label ? ` label=${queued.label}` : ""}`,
      );
    }
  }

  async acquire(params?: { config?: OpenClawConfig; label?: string }): Promise<() => void> {
    this.refreshLimit(params?.config);

    if (this.activeTurns < this.limit && this.waitingTurns.length === 0) {
      this.activeTurns += 1;
      return this.createRelease();
    }

    return new Promise<() => void>((resolve) => {
      const queuedAhead = this.waitingTurns.length;
      this.waitingTurns.push({
        resolve,
        enqueuedAt: Date.now(),
        label: params?.label,
      });
      log.info(
        `agent turn queued: active=${this.activeTurns} queuedAhead=${queuedAhead} limit=${this.limit}${params?.label ? ` label=${params.label}` : ""}`,
      );
      this.pump();
    });
  }
}

export const agentTurnSemaphore = new AgentTurnSemaphore();
