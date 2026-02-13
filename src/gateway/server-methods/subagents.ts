import type { GatewayRequestHandlers } from "./types.js";
import {
  listAllActiveSubagentRuns,
  listSubagentRunsForRequester,
  releaseSubagentRun,
} from "../../agents/subagent-registry.js";

export const subagentsHandlers: GatewayRequestHandlers = {
  "subagents.list": ({ params, respond }) => {
    const raw = params.requesterSessionKey;
    const requesterSessionKey = typeof raw === "string" ? raw.trim() : "";

    const runs = requesterSessionKey
      ? listSubagentRunsForRequester(requesterSessionKey)
      : listAllActiveSubagentRuns();

    const payload = runs.map((r) => ({
      runId: r.runId,
      childSessionKey: r.childSessionKey,
      requesterSessionKey: r.requesterSessionKey,
      task: r.task,
      label: r.label,
      createdAt: r.createdAt,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      outcome: r.outcome,
    }));

    respond(true, { runs: payload }, undefined);
  },

  "subagents.dismiss": ({ params, respond }) => {
    const runId = typeof params.runId === "string" ? params.runId.trim() : "";
    if (!runId) {
      respond(false, undefined, "runId is required");
      return;
    }
    releaseSubagentRun(runId);
    respond(true, { dismissed: true }, undefined);
  },
};
