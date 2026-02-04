import type { PanelType } from "../../types";
import { CodingSessionPanel } from "../coding/CodingSessionPanel";
import { BrowserPanel } from "./BrowserPanel";
import { ChatPanel } from "./ChatPanel";

interface PanelContentProps {
  type: PanelType;
  data?: Record<string, unknown>;
  workspaceId: string;
  activeChatId?: string;
}

export function PanelContent({ type, data, workspaceId, activeChatId }: PanelContentProps) {
  switch (type) {
    case "chat":
      if (!activeChatId) {
        return (
          <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
            <p className="text-sm">No chat selected</p>
            <p className="text-xs mt-2">Create a new chat to get started</p>
          </div>
        );
      }
      return <ChatPanel chatId={activeChatId} />;

    case "coding-session": {
      const sessionKey = data?.sessionKey as string | undefined;
      if (!sessionKey) {
        return (
          <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
            <p className="text-sm">No coding session</p>
          </div>
        );
      }
      return <CodingSessionPanel sessionKey={sessionKey} />;
    }

    case "terminal":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Terminal Panel</p>
          <p className="text-xs mt-2 text-muted-foreground/60">Workspace: {workspaceId}</p>
        </div>
      );

    case "browser": {
      const url = data?.url as string | undefined;
      const panelId = data?.panelId as string | undefined;
      return <BrowserPanel panelId={panelId ?? "browser-default"} initialUrl={url} />;
    }

    case "preview":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Preview Panel</p>
          <p className="text-xs mt-2 text-muted-foreground/60">iOS Simulator / Web Preview</p>
        </div>
      );

    case "tasks":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Tasks Panel</p>
          <p className="text-xs mt-2 text-muted-foreground/60">Kanban board coming soon</p>
        </div>
      );

    case "code":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Code Panel</p>
          <p className="text-xs mt-2 text-muted-foreground/60">Diff view / File browser</p>
        </div>
      );

    case "empty":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-muted/20 text-muted-foreground border-2 border-dashed border-muted">
          <p className="text-sm">Empty Panel</p>
          <p className="text-xs mt-2">Split to add content</p>
        </div>
      );

    default:
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Unknown panel type: {type}</p>
        </div>
      );
  }
}
