import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const ToolApprovalRequestParamsSchema = Type.Object(
  {
    id: Type.Optional(NonEmptyString),
    toolName: NonEmptyString,
    toolInput: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    agentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    sessionKey: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const ToolApprovalResolveParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    decision: NonEmptyString,
  },
  { additionalProperties: false },
);
