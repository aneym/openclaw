import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import type { ChatGroup } from "../../lib/chat-grouping";
import type { Chat, Project } from "../../types";
import { cn } from "../../lib/utils";
import { ChatItem } from "./ChatItem";
import { DraggableChatItem } from "./DraggableChatItem";

interface ChatGroupSectionProps {
  group: ChatGroup;
  chats: Chat[];
  isCollapsed: boolean;
  onToggle: () => void;
  activeChatId: string | null;
  onSelectChat: (chat: Chat, options?: { splitPane?: boolean }) => void;
  onArchiveChat: (chatId: string) => void;
  onCopySessionId: (sessionKey: string) => void;
  projectsMap?: Map<string, Project>;
  showProjectBadges?: boolean;
  projects?: Project[];
  onAssignToProject?: (chatId: string, projectId: string | null) => void;
}

export const ChatGroupSection = memo(function ChatGroupSection({
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
      {/* No animation - immediate show/hide for performance */}
      {!isCollapsed && (
        <div className="space-y-0.5 mt-1">
          {chats.map((chat) => (
            <MemoizedChatItemWrapper
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              onSelectChat={onSelectChat}
              onArchiveChat={onArchiveChat}
              onCopySessionId={onCopySessionId}
              projectsMap={projectsMap}
              showProjectBadges={showProjectBadges}
              projects={projects}
              onAssignToProject={onAssignToProject}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// Memoized wrapper that creates stable callbacks per-chat
interface ChatItemWrapperProps {
  chat: Chat;
  isActive: boolean;
  onSelectChat: (chat: Chat, options?: { splitPane?: boolean }) => void;
  onArchiveChat: (chatId: string) => void;
  onCopySessionId: (sessionKey: string) => void;
  projectsMap?: Map<string, Project>;
  showProjectBadges: boolean;
  projects?: Project[];
  onAssignToProject?: (chatId: string, projectId: string | null) => void;
}

const MemoizedChatItemWrapper = memo(function ChatItemWrapper({
  chat,
  isActive,
  onSelectChat,
  onArchiveChat,
  onCopySessionId,
  projectsMap,
  showProjectBadges,
  projects,
  onAssignToProject,
}: ChatItemWrapperProps) {
  // Create stable callbacks that close over the chat
  const handleSelect = useCallback(
    (options?: { splitPane?: boolean }) => onSelectChat(chat, options),
    [chat, onSelectChat],
  );
  const handleArchive = useCallback(() => onArchiveChat(chat.id), [chat.id, onArchiveChat]);
  const handleCopySessionId = useCallback(
    () => onCopySessionId(chat.sessionKey),
    [chat.sessionKey, onCopySessionId],
  );

  // Find project for this chat
  const project = useMemo(
    () => (showProjectBadges && projectsMap ? findProjectForChat(chat, projectsMap) : undefined),
    [showProjectBadges, projectsMap, chat],
  );

  return (
    <DraggableChatItem chat={chat}>
      <ChatItem
        chat={chat}
        isActive={isActive}
        onSelect={handleSelect}
        onArchive={handleArchive}
        onCopySessionId={handleCopySessionId}
        project={project}
        showProjectBadge={showProjectBadges}
        projects={projects}
        onAssignToProject={onAssignToProject}
      />
    </DraggableChatItem>
  );
});

// Helper to find project for a chat - now uses projectId directly
function findProjectForChat(chat: Chat, projectsMap: Map<string, Project>): Project | undefined {
  if (!chat.projectId) return undefined;
  return projectsMap.get(chat.projectId);
}
