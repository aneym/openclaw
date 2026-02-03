import { Check, ChevronDown, Plus } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function WorkspaceSwitcher() {
  const { config, activeWorkspace, setActiveWorkspace, addWorkspace } = useWorkspaceStore();

  const handleCreateWorkspace = () => {
    const name = prompt("Enter workspace name:");
    if (!name) return;

    const newWorkspace = {
      id: `ws-${Date.now()}`,
      name,
      icon: "💼",
      projects: [],
      gatewayUrl: "ws://localhost:18789",
      createdAt: Date.now(),
    };

    addWorkspace(newWorkspace);
    setActiveWorkspace(newWorkspace.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-3 h-10 text-left font-normal hover:bg-accent/50 transition-all duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base shrink-0 leading-none">{activeWorkspace?.icon}</span>
            <span className="truncate font-medium">{activeWorkspace?.name}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {config.workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => setActiveWorkspace(workspace.id)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className="text-base">{workspace.icon}</span>
            <span className="flex-1 truncate">{workspace.name}</span>
            {activeWorkspace?.id === workspace.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateWorkspace} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span>New Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
