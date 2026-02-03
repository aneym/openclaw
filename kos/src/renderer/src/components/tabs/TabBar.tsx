import { TabItem } from "./TabItem";

export type TabBarItem = {
  id: string;
  title: string;
  icon?: string;
  isPinned?: boolean;
  isStreaming?: boolean;
};

interface TabBarProps {
  tabs: TabBarItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: TabBarProps) {
  return (
    <div className="shrink-0 border-b border-border bg-muted/40">
      <div
        className="flex items-center gap-1 px-2 overflow-x-auto py-1 [-webkit-app-region:no-drag]"
        role="tablist"
        aria-label="Open tabs"
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            title={tab.title}
            icon={tab.icon}
            isPinned={tab.isPinned}
            isStreaming={tab.isStreaming}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelectTab(tab.id)}
            onClose={tab.isPinned ? undefined : () => onCloseTab(tab.id)}
          />
        ))}
      </div>
    </div>
  );
}
