import type { GatewayBrowserClient } from "../gateway";
import type { GitFileStatus, GitLogEntry, GitStatusResult } from "../types";

export type GitState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  gitLoading: boolean;
  gitError: string | null;
  gitBranch: string;
  gitFiles: GitFileStatus[];
  gitAhead: number;
  gitBehind: number;
  gitLogEntries: GitLogEntry[];
  gitLogLoading: boolean;
  gitDiff: string | null;
  gitDiffLoading: boolean;
  gitCommitMessage: string;
  gitCommitting: boolean;
  gitSelectedPath: string | null;
  gitDiffStaged: boolean;
};

export async function loadGitStatus(state: GitState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.gitLoading) {
    return;
  }
  state.gitLoading = true;
  state.gitError = null;
  try {
    // eslint-disable-next-line typescript-eslint/no-unnecessary-type-assertion -- request() returns unknown
    const res = (await state.client.request("git.status", {})) as GitStatusResult;
    state.gitBranch = res.branch;
    state.gitFiles = res.files;
    state.gitAhead = res.ahead;
    state.gitBehind = res.behind;
  } catch (err) {
    state.gitError = String(err);
  } finally {
    state.gitLoading = false;
  }
}

export async function loadGitLog(state: GitState, count = 50) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.gitLogLoading) {
    return;
  }
  state.gitLogLoading = true;
  try {
    const res = await state.client.request("git.log", { count });
    state.gitLogEntries = res.entries;
  } catch (err) {
    state.gitError = String(err);
  } finally {
    state.gitLogLoading = false;
  }
}

export async function loadGitDiff(state: GitState, staged: boolean, path?: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.gitDiffLoading = true;
  state.gitDiffStaged = staged;
  state.gitSelectedPath = path ?? null;
  try {
    const res = await state.client.request("git.diff", { staged, path });
    state.gitDiff = res.diff;
  } catch (err) {
    state.gitError = String(err);
  } finally {
    state.gitDiffLoading = false;
  }
}

export async function stageFiles(state: GitState, paths: string[]) {
  if (!state.client || !state.connected || paths.length === 0) {
    return;
  }
  try {
    // eslint-disable-next-line typescript-eslint/no-unnecessary-type-assertion -- request() returns unknown
    const res = (await state.client.request("git.stage", { paths })) as GitStatusResult;
    state.gitBranch = res.branch;
    state.gitFiles = res.files;
    state.gitAhead = res.ahead;
    state.gitBehind = res.behind;
  } catch (err) {
    state.gitError = String(err);
  }
}

export async function unstageFiles(state: GitState, paths: string[]) {
  if (!state.client || !state.connected || paths.length === 0) {
    return;
  }
  try {
    // eslint-disable-next-line typescript-eslint/no-unnecessary-type-assertion -- request() returns unknown
    const res = (await state.client.request("git.unstage", { paths })) as GitStatusResult;
    state.gitBranch = res.branch;
    state.gitFiles = res.files;
    state.gitAhead = res.ahead;
    state.gitBehind = res.behind;
  } catch (err) {
    state.gitError = String(err);
  }
}

export async function commitChanges(state: GitState) {
  const message = state.gitCommitMessage.trim();
  if (!state.client || !state.connected || !message) {
    return;
  }
  state.gitCommitting = true;
  try {
    // eslint-disable-next-line typescript-eslint/no-unnecessary-type-assertion -- request() returns unknown
    const res = (await state.client.request("git.commit", { message })) as GitStatusResult;
    state.gitBranch = res.branch;
    state.gitFiles = res.files;
    state.gitAhead = res.ahead;
    state.gitBehind = res.behind;
    state.gitCommitMessage = "";
  } catch (err) {
    state.gitError = String(err);
  } finally {
    state.gitCommitting = false;
  }
}

export async function discardFiles(state: GitState, paths: string[]) {
  if (!state.client || !state.connected || paths.length === 0) {
    return;
  }
  try {
    // eslint-disable-next-line typescript-eslint/no-unnecessary-type-assertion -- request() returns unknown
    const res = (await state.client.request("git.discard", { paths })) as GitStatusResult;
    state.gitBranch = res.branch;
    state.gitFiles = res.files;
    state.gitAhead = res.ahead;
    state.gitBehind = res.behind;
  } catch (err) {
    state.gitError = String(err);
  }
}
