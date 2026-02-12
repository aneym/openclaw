import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { readStringParam } from "./common.js";
import { createDisplayAssetTool } from "./display-asset-tool.js";

const DisplayImageToolSchema = Type.Object({
  path: Type.String(),
  caption: Type.Optional(Type.String()),
});

export function createDisplayImageTool(): AnyAgentTool {
  const displayAssetTool = createDisplayAssetTool();
  return {
    label: "Display image",
    name: "display_image",
    description:
      "Display an image in chat with hover controls (copy/download/copy path) and click-to-expand lightbox. Use this after creating or locating an image file.",
    parameters: DisplayImageToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedPath = readStringParam(params, "path", { required: true, label: "path" });
      const caption = readStringParam(params, "caption");
      return await displayAssetTool.execute(_toolCallId, {
        path: requestedPath,
        ...(caption ? { caption } : {}),
        kind: "image",
      });
    },
  };
}
