export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: MessagePart[];
  chatId: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type MessagePart =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart
  | ImagePart
  | AudioPart
  | VideoPart
  | FilePart;

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: ToolCallState;
}

export type ToolCallState = "streaming" | "pending" | "complete" | "error";

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface ReasoningPart {
  type: "reasoning";
  reasoning: string;
  durationMs?: number;
}

export interface ImagePart {
  type: "image";
  url: string;
  alt?: string;
}

export interface AudioPart {
  type: "audio";
  url: string;
  filename?: string;
}

export interface VideoPart {
  type: "video";
  url: string;
  filename?: string;
}

export interface FilePart {
  type: "file";
  url: string;
  filename: string;
  mimeType?: string;
}
