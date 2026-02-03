import { describe, expect, it, vi } from "vitest";
import type { CronServiceDeps } from "./service/state.js";
import { CronService } from "./service.js";

const createMockDeps = (overrides: Partial<CronServiceDeps> = {}): CronServiceDeps => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  storePath: "/tmp/test-cron-store.json",
  cronEnabled: true,
  enqueueSystemEvent: vi.fn(),
  requestHeartbeatNow: vi.fn(),
  runHeartbeatOnce: vi.fn().mockResolvedValue({ status: "ran" as const }),
  runIsolatedAgentJob: vi.fn().mockResolvedValue({ status: "ok" as const }),
  onEvent: vi.fn(),
  ...overrides,
});

describe("CronService exponential backoff", () => {
  it("applies exponential backoff on rate_limit error", async () => {
    const nowMs = 1000000;
    let currentTime = nowMs;
    const runIsolatedAgentJob = vi.fn().mockResolvedValue({
      status: "error" as const,
      error: "HTTP 429 rate_limit_error: This request would exceed your account's rate limit",
    });

    const deps = createMockDeps({
      runIsolatedAgentJob,
    });

    const service = new CronService({
      ...deps,
      nowMs: () => currentTime,
    });

    await service.start();

    // Add a job that runs every minute
    const job = await service.add({
      name: "Test Job",
      enabled: true,
      schedule: { kind: "every", everyMs: 60000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "test" },
      state: {},
    });

    // First failure - should apply backoff
    currentTime = nowMs;
    await service.run(job.id, "force");

    const jobs1 = await service.list();
    const job1 = jobs1.find((j: { id: string }) => j.id === job.id)!;
    expect(job1.state.consecutiveFailures).toBe(1);
    expect(job1.state.lastFailureReason).toBe("rate_limit");
    // Next run should be at least 5 seconds in the future (initial backoff)
    expect(job1.state.nextRunAtMs).toBeGreaterThanOrEqual(currentTime + 5000);

    // Second failure - should double the backoff
    currentTime = job1.state.nextRunAtMs!;
    await service.run(job.id, "force");

    const jobs2 = await service.list();
    const job2 = jobs2.find((j: { id: string }) => j.id === job.id)!;
    expect(job2.state.consecutiveFailures).toBe(2);
    // Next run should be at least 10 seconds in the future (doubled)
    expect(job2.state.nextRunAtMs).toBeGreaterThanOrEqual(currentTime + 10000);

    // Third failure - should double again
    currentTime = job2.state.nextRunAtMs!;
    await service.run(job.id, "force");

    const jobs3 = await service.list();
    const job3 = jobs3.find((j: { id: string }) => j.id === job.id)!;
    expect(job3.state.consecutiveFailures).toBe(3);
    // Next run should be at least 20 seconds in the future
    expect(job3.state.nextRunAtMs).toBeGreaterThanOrEqual(currentTime + 20000);

    service.stop();
  });

  it("applies exponential backoff on overloaded error", async () => {
    const nowMs = 1000000;
    let currentTime = nowMs;
    const runIsolatedAgentJob = vi.fn().mockResolvedValue({
      status: "error" as const,
      error: "The AI service is temporarily overloaded",
    });

    const deps = createMockDeps({ runIsolatedAgentJob });
    const service = new CronService({
      ...deps,
      nowMs: () => currentTime,
    });

    await service.start();

    const job = await service.add({
      name: "Test Job",
      enabled: true,
      schedule: { kind: "every", everyMs: 60000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "test" },
      state: {},
    });

    currentTime = nowMs;
    await service.run(job.id, "force");

    const jobs = await service.list();
    const updatedJob = jobs.find((j: { id: string }) => j.id === job.id)!;
    expect(updatedJob.state.consecutiveFailures).toBe(1);
    expect(updatedJob.state.lastFailureReason).toBe("rate_limit");
    expect(updatedJob.state.nextRunAtMs).toBeGreaterThanOrEqual(currentTime + 5000);

    service.stop();
  });

  it("resets consecutive failures on successful run", async () => {
    const nowMs = 1000000;
    let currentTime = nowMs;
    let callCount = 0;
    const runIsolatedAgentJob = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          status: "error" as const,
          error: "HTTP 429 rate limit",
        });
      }
      return Promise.resolve({ status: "ok" as const, summary: "Success" });
    });

    const deps = createMockDeps({ runIsolatedAgentJob });
    const service = new CronService({
      ...deps,
      nowMs: () => currentTime,
    });

    await service.start();

    const job = await service.add({
      name: "Test Job",
      enabled: true,
      schedule: { kind: "every", everyMs: 60000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "test" },
      state: {},
    });

    // Two failures
    currentTime = nowMs;
    await service.run(job.id, "force");
    currentTime = (await service.list()).find((j) => j.id === job.id)!.state.nextRunAtMs!;
    await service.run(job.id, "force");

    let jobs = await service.list();
    let updatedJob = jobs.find((j) => j.id === job.id)!;
    expect(updatedJob.state.consecutiveFailures).toBe(2);

    // Success - should reset
    currentTime = updatedJob.state.nextRunAtMs!;
    await service.run(job.id, "force");

    jobs = await service.list();
    updatedJob = jobs.find((j) => j.id === job.id)!;
    expect(updatedJob.state.consecutiveFailures).toBe(0);
    expect(updatedJob.state.lastStatus).toBe("ok");

    service.stop();
  });

  it("does not apply backoff for non-rate-limit errors", async () => {
    const nowMs = 1000000;
    let currentTime = nowMs;
    const runIsolatedAgentJob = vi.fn().mockResolvedValue({
      status: "error" as const,
      error: "Some random error",
    });

    const deps = createMockDeps({ runIsolatedAgentJob });
    const service = new CronService({
      ...deps,
      nowMs: () => currentTime,
    });

    await service.start();

    const job = await service.add({
      name: "Test Job",
      enabled: true,
      schedule: { kind: "every", everyMs: 60000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "test" },
      state: {},
    });

    currentTime = nowMs;
    await service.run(job.id, "force");

    const jobs = await service.list();
    const updatedJob = jobs.find((j: { id: string }) => j.id === job.id)!;
    // Still tracks consecutive failures but doesn't apply backoff
    expect(updatedJob.state.consecutiveFailures).toBe(1);
    // Should use normal schedule (60 seconds), not backoff
    expect(updatedJob.state.nextRunAtMs).toBe(currentTime + 60000);

    service.stop();
  });

  it("caps backoff at maximum (5 minutes)", async () => {
    const nowMs = 1000000;
    let currentTime = nowMs;
    const runIsolatedAgentJob = vi.fn().mockResolvedValue({
      status: "error" as const,
      error: "HTTP 429 rate limit",
    });

    const deps = createMockDeps({ runIsolatedAgentJob });
    const service = new CronService({
      ...deps,
      nowMs: () => currentTime,
    });

    await service.start();

    const job = await service.add({
      name: "Test Job",
      enabled: true,
      schedule: { kind: "every", everyMs: 1000 }, // 1 second schedule
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "test" },
      state: {},
    });

    // Simulate many failures to hit max backoff
    for (let i = 0; i < 10; i++) {
      currentTime = (await service.list()).find((j) => j.id === job.id)?.state.nextRunAtMs ?? nowMs;
      await service.run(job.id, "force");
    }

    const jobs = await service.list();
    const updatedJob = jobs.find((j: { id: string }) => j.id === job.id)!;
    expect(updatedJob.state.consecutiveFailures).toBe(10);
    // Backoff should be capped at 5 minutes (300,000ms), not 5 * 2^9 = 2560 seconds
    const nextRunDelay = updatedJob.state.nextRunAtMs! - currentTime;
    expect(nextRunDelay).toBeLessThanOrEqual(300000 + 1000); // 5 min + jitter margin
    expect(nextRunDelay).toBeGreaterThanOrEqual(300000 - 30000); // 5 min - jitter margin

    service.stop();
  });

  it("uses backoff time when it exceeds scheduled time", async () => {
    const nowMs = 1000000;
    let currentTime = nowMs;
    const runIsolatedAgentJob = vi.fn().mockResolvedValue({
      status: "error" as const,
      error: "HTTP 429 rate limit",
    });

    const deps = createMockDeps({ runIsolatedAgentJob });
    const service = new CronService({
      ...deps,
      nowMs: () => currentTime,
    });

    await service.start();

    // Schedule is every 1 second, but backoff should be 5 seconds
    const job = await service.add({
      name: "Test Job",
      enabled: true,
      schedule: { kind: "every", everyMs: 1000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "test" },
      state: {},
    });

    currentTime = nowMs;
    await service.run(job.id, "force");

    const jobs = await service.list();
    const updatedJob = jobs.find((j: { id: string }) => j.id === job.id)!;
    // Should use backoff (5s) not schedule (1s)
    // Jitter can reduce by up to 10%, so minimum is ~4500ms
    expect(updatedJob.state.nextRunAtMs).toBeGreaterThanOrEqual(currentTime + 4500);
    // And should definitely be more than the 1s schedule
    expect(updatedJob.state.nextRunAtMs).toBeGreaterThan(currentTime + 2000);

    service.stop();
  });
});
