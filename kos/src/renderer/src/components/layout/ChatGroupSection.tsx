import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChatGroup } from "../../lib/chat-grouping";
import type { Chat, Project } from "../../types";
import { cn } from "../../lib/utils";
import { ChatItem } from "./ChatItem";

interface ChatGroupSectionProps {
  group: ChatGroup;
  chats: Chat[];
  isCollapsed: boolean;
  onToggle: () => void;
  activeChatId: string | null;
  onSelectChat: (chat: Chat) => void;
  onArchiveChat: (chatId: string) => void;
  onCopySessionId: (sessionKey: string) => void;
  projectsMap?: Map<string, Project>;
  showProjectBadges?: boolean;
  projects?: Project[];
  onAssignToProject?: (chatId: string, projectId: string | null) => void;
}

export function ChatGroupSection({
  group,
  chats,
  isCollapsed,
  onToggle,
  activeChatId,
  onSelectChat,
  onArchiveChat,
  onCopySessionId,
  projectsMap,
  showProjectBadges = false,
  projects,
  onAssignToProject,
}: ChatGroupSectionProps) {
  if (chats.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className={cn(
          "w-full px-2 py-1 flex items-center gap-1 text-xs font-medium",
          "text-muted-foreground/70 hover:text-muted-foreground transition-colors",
        )}
      >
        {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span className="uppercase tracking-wider">{group}</span>
        <span className="ml-auto text-muted-foreground/50">{chats.length}</span>
      </button>
      {!isCollapsed && (
        <div className="space-y-0.5 mt-1">
          {chats.map((chat) => {
            // Find project for this chat via workspace
            const project =
              showProjectBadges && projectsMap ? findProjectForChat(chat, projectsMap) : undefined;

            return (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activeChatId}
                onSelect={() => onSelectChat(chat)}
                onArchive={() => onArchiveChat(chat.id)}
                onCopySessionId={() => onCopySessionId(chat.sessionKey)}
                project={project}
                showProjectBadge={showProjectBadges}
                projects={projects}
                onAssignToProject={onAssignToProject}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper to find project for a chat - now uses projectId directly
function findProjectForChat(chat: Chat, projectsMap: Map<string, Project>): Project | undefined {
  if (!chat.projectId) return undefined;
  return projectsMap.get(chat.projectId);
}
