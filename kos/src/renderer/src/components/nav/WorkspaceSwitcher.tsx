import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function WorkspaceSwitcher() {
  const { config, activeWorkspace, setActiveWorkspace, addWorkspace } = useWorkspaceStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const handleCreateWorkspace = () => {
    if (!newWorkspaceName.trim()) return;

    const newWorkspace = {
      id: `ws-${Date.now()}`,
      name: newWorkspaceName.trim(),
      icon: "💼",
      projects: [],
      gatewayUrl: "ws://localhost:18789",
      createdAt: Date.now(),
    };

    addWorkspace(newWorkspace);
    setActiveWorkspace(newWorkspace.id);
    setDialogOpen(false);
    setNewWorkspaceName("");
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
        <DropdownMenuItem onClick={() => setDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span>New Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>Enter a name for your new workspace.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="My Workspace"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateWorkspace();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
