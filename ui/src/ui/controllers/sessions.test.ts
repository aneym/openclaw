import { describe, expect, it, vi } from "vitest";
import type { SessionsState } from "./sessions.ts";
import { loadSessions } from "./sessions.ts";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createListResult() {
  return {
    ts: Date.now(),
    path: "sessions.json",
    count: 0,
    defaults: { model: null, contextTokens: null },
    sessions: [],
  };
}

function createState(request: ReturnType<typeof vi.fn>): SessionsState {
  return {
    client: { request } as unknown as SessionsState["client"],
    connected: true,
    sessionsLoading: false,
    sessionsResult: null,
    sessionsError: null,
    sessionsFilterActive: "15",
    sessionsFilterLimit: "20",
    sessionsIncludeGlobal: false,
    sessionsIncludeUnknown: false,
  };
}

describe("loadSessions", () => {
  it("replays one merged refresh after in-flight load completes", async () => {
    const first = createDeferred<unknown>();
    const request = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockResolvedValue(createListResult());
    const state = createState(request);

    const initial = loadSessions(state);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe("sessions.list");
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      activeMinutes: 15,
      limit: 20,
      includeGlobal: false,
      includeUnknown: false,
      includeDerivedTitles: true,
    });

    void loadSessions(state, { activeMinutes: 60, includeUnknown: true });
    void loadSessions(state, { limit: 5 });
    expect(request).toHaveBeenCalledTimes(1);

    first.resolve(createListResult());
    await initial;
    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toBe("sessions.list");
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      activeMinutes: 60,
      limit: 5,
      includeGlobal: false,
      includeUnknown: true,
      includeDerivedTitles: true,
    });
    expect(state.sessionsLoading).toBe(false);
  });

  it("uses the latest pending override values when fields are re-requested", async () => {
    const first = createDeferred<unknown>();
    const request = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockResolvedValue(createListResult());
    const state = createState(request);

    const initial = loadSessions(state);
    void loadSessions(state, { activeMinutes: 5 });
    void loadSessions(state, { activeMinutes: 30, limit: 8 });

    first.resolve(createListResult());
    await initial;
    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      activeMinutes: 30,
      limit: 8,
      includeDerivedTitles: true,
    });
  });
});
