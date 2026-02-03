import { Command } from "cmdk";
import { Folder } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useProjectStore } from "../../stores/project-store";
import { useTabStore } from "../../stores/tab-store";
import { Dialog, DialogContent } from "../ui/dialog";

interface ProjectPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onSelectProject?: (projectId: string) => void;
}

export function ProjectPicker({
  open,
  onOpenChange,
  workspaceId,
  onSelectProject,
}: ProjectPickerProps) {
  const [search, setSearch] = useState("");
  const projectsMap = useProjectStore((s) => s.projects);
  const openProjectTab = useTabStore((s) => s.openProjectTab);

  const projects = useMemo(() => {
    return Array.from(projectsMap.values())
      .filter((project) => project.workspaceId === workspaceId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectsMap, workspaceId]);

  const handleSelect = (projectId: string) => {
    openProjectTab(workspaceId, projectId);
    onSelectProject?.(projectId);
    onOpenChange(false);
    setSearch("");
  };

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-2xl">
        <Command className="rounded-lg border-0 shadow-none" shouldFilter={true}>
          <div className="flex items-center border-b px-3">
            <Folder className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Open project..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            />
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No projects found.
            </Command.Empty>
            {projects.map((project) => (
              <Command.Item
                key={project.id}
                value={project.name}
                onSelect={() => handleSelect(project.id)}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{project.icon ?? "📁"}</span>
                  <span className="font-medium truncate">{project.name}</span>
                </div>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
