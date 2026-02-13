import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Eye,
  Loader2,
  ListTodo,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import {
  useGatewayTasksStore,
  type GatewayTask,
  type GatewayTaskProject,
  type TaskPriority,
  type TaskStatus,
} from "../../stores/gateway-tasks-store";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

// ── Column definitions ──────────────────────────────────────────────

interface ColumnDef {
  status: TaskStatus;
  label: string;
  icon: ReactNode;
}

const COLUMNS: ColumnDef[] = [
  { status: "backlog", label: "Backlog", icon: <Circle className="h-3 w-3" /> },
  { status: "todo", label: "To Do", icon: <ListTodo className="h-3 w-3" /> },
  { status: "in_progress", label: "In Progress", icon: <Loader2 className="h-3 w-3" /> },
  { status: "blocked", label: "Blocked", icon: <AlertCircle className="h-3 w-3" /> },
  { status: "review", label: "Review", icon: <Eye className="h-3 w-3" /> },
  { status: "done", label: "Done", icon: <CheckCircle2 className="h-3 w-3" /> },
];

// ── Priority config ─────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-destructive/20 text-destructive" },
  high: { label: "High", className: "bg-destructive/10 text-destructive/80" },
  medium: { label: "Medium", className: "bg-primary/10 text-primary" },
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  none: { label: "None", className: "bg-muted text-muted-foreground" },
};

// ── Helpers ─────────────────────────────────────────────────────────

function parseLabels(labelsJson: string): string[] {
  try {
    const parsed = JSON.parse(labelsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function relativeDate(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const days = Math.floor(diff / 86_400_000);
  if (days < 0) {
    const futureDays = Math.abs(days);
    if (futureDays === 0) {
      return "today";
    }
    if (futureDays === 1) {
      return "tomorrow";
    }
    return `in ${futureDays}d`;
  }
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 30) {
    return `${days}d ago`;
  }
  return `${Math.floor(days / 30)}mo ago`;
}

function isOverdue(epochMs: number): boolean {
  // Overdue if due date is before start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return epochMs < today.getTime();
}

// ── Task Card ───────────────────────────────────────────────────────

interface TaskCardProps {
  task: GatewayTask;
  onEdit: (task: GatewayTask) => void;
}

const TaskCard = memo(function TaskCard({ task, onEdit }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: {
      type: "task-card",
      taskId: task.id,
      currentStatus: task.status,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const labels = useMemo(() => parseLabels(task.labels), [task.labels]);
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.none;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(task)}
      className={cn(
        "p-3 bg-card border border-border rounded-lg cursor-grab active:cursor-grabbing",
        "hover:border-primary/50 transition-colors",
        isDragging && "opacity-50",
      )}
    >
      {/* Priority badge */}
      {task.priority !== "none" && (
        <div className="mb-1.5">
          <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", priority.className)}>
            {priority.label}
          </Badge>
        </div>
      )}

      {/* Title */}
      <h4 className="text-sm font-medium line-clamp-2">{task.title}</h4>

      {/* Description preview */}
      {task.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
      )}

      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {labels.slice(0, 3).map((label) => (
            <span
              key={label}
              className="px-1.5 py-0.5 text-[10px] rounded-full bg-accent text-accent-foreground"
            >
              {label}
            </span>
          ))}
          {labels.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: assignee + due date */}
      {(task.assigned_to || task.due_date) && (
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          {task.assigned_to && (
            <div className="flex items-center gap-1 truncate">
              <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-medium shrink-0">
                {task.assigned_to.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{task.assigned_to}</span>
            </div>
          )}
          {task.due_date && (
            <div
              className={cn(
                "flex items-center gap-1 ml-auto shrink-0",
                task.status !== "done" && isOverdue(task.due_date) && "text-destructive",
              )}
            >
              <Calendar className="h-3 w-3" />
              <span>{relativeDate(task.due_date)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Drag Overlay Card ───────────────────────────────────────────────

function DragOverlayCard({ task }: { task: GatewayTask }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.none;
  return (
    <div className="p-3 bg-card border border-border rounded-lg shadow-xl rotate-2 w-[280px]">
      {task.priority !== "none" && (
        <Badge
          variant="secondary"
          className={cn("text-[10px] px-1.5 py-0 mb-1", priority.className)}
        >
          {priority.label}
        </Badge>
      )}
      <h4 className="text-sm font-medium line-clamp-2">{task.title}</h4>
    </div>
  );
}

// ── Inline Add Task Form ────────────────────────────────────────────

interface AddTaskFormProps {
  status: TaskStatus;
  projectId: string;
}

function AddTaskForm({ status, projectId }: AddTaskFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useGatewayTasksStore((s) => s.createTask);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    try {
      await createTask({ project_id: projectId, title: trimmed, status });
      setTitle("");
      setIsOpen(false);
    } catch {
      toast.error("Failed to create task");
    }
  }, [title, createTask, projectId, status]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setTitle("");
      }
    },
    [handleSubmit],
  );

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add task
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!title.trim()) {
            setIsOpen(false);
          }
        }}
        placeholder="Task title..."
        className="h-7 text-xs"
      />
      <div className="flex gap-1">
        <Button size="sm" className="h-6 text-xs px-2" onClick={handleSubmit}>
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2"
          onClick={() => {
            setIsOpen(false);
            setTitle("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Column ──────────────────────────────────────────────────────────

interface TaskColumnProps {
  column: ColumnDef;
  tasks: GatewayTask[];
  projectId: string;
  isDragging: boolean;
  onEditTask: (task: GatewayTask) => void;
}

const TaskColumn = memo(function TaskColumn({
  column,
  tasks,
  projectId,
  isDragging,
  onEditTask,
}: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.status,
    data: {
      type: "task-column",
      status: column.status,
    },
  });

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] h-full">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-muted-foreground">{column.icon}</span>
        <h3 className="text-sm font-medium truncate">{column.label}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-2",
          "transition-colors duration-150",
          isOver && isDragging && "bg-primary/5",
        )}
      >
        {/* Add task form at top */}
        <AddTaskForm status={column.status} projectId={projectId} />

        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={onEditTask} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/60 border border-dashed border-muted rounded-lg">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
});

// ── Task Detail Dialog ──────────────────────────────────────────────

interface TaskDetailProps {
  task: GatewayTask;
  onClose: () => void;
}

function TaskDetail({ task, onClose }: TaskDetailProps) {
  const updateTask = useGatewayTasksStore((s) => s.updateTask);
  const deleteTask = useGatewayTasksStore((s) => s.deleteTask);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");

  const handleSave = useCallback(async () => {
    try {
      await updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assigned_to: assignedTo.trim() || null,
      });
      onClose();
    } catch {
      toast.error("Failed to update task");
    }
  }, [task.id, title, description, status, priority, assignedTo, updateTask, onClose]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteTask(task.id);
      onClose();
    } catch {
      toast.error("Failed to delete task");
    }
  }, [task.id, deleteTask, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 p-6 space-y-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>

        {/* Status + Priority row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS.map((col) => (
                  <SelectItem key={col.status} value={col.status} className="text-xs">
                    {col.label}
                  </SelectItem>
                ))}
                <SelectItem value="cancelled" className="text-xs">
                  Cancelled
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Assignee</label>
          <Input
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Unassigned"
            className="h-8 text-xs"
          />
        </div>

        {/* Timestamps */}
        <div className="flex gap-4 text-[10px] text-muted-foreground">
          <span>Created {relativeDate(task.created_at)}</span>
          <span>Updated {relativeDate(task.updated_at)}</span>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive h-8 text-xs"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Project Selector ────────────────────────────────────────────────

interface ProjectSelectorProps {
  projects: GatewayTaskProject[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
}

function ProjectSelector({ projects, activeProjectId, onSelect }: ProjectSelectorProps) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <Select value={activeProjectId ?? ""} onValueChange={onSelect}>
      <SelectTrigger className="h-7 w-[180px] text-xs">
        <SelectValue placeholder="All projects" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-xs">
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Board (root component) ──────────────────────────────────────────

export function GatewayTasksBoard() {
  const tasks = useGatewayTasksStore((s) => s.tasks);
  const projects = useGatewayTasksStore((s) => s.projects);
  const activeProjectId = useGatewayTasksStore((s) => s.activeProjectId);
  const loading = useGatewayTasksStore((s) => s.loading);
  const error = useGatewayTasksStore((s) => s.error);
  const fetchProjects = useGatewayTasksStore((s) => s.fetchProjects);
  const fetchTasks = useGatewayTasksStore((s) => s.fetchTasks);
  const reorderTask = useGatewayTasksStore((s) => s.reorderTask);
  const setActiveProject = useGatewayTasksStore((s) => s.setActiveProject);

  const [activeTask, setActiveTask] = useState<GatewayTask | null>(null);
  const [editingTask, setEditingTask] = useState<GatewayTask | null>(null);

  // Fetch projects + tasks on mount
  useEffect(() => {
    fetchProjects();
    fetchTasks();
  }, [fetchProjects, fetchTasks]);

  // Re-fetch tasks when active project changes
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId],
  );

  useEffect(() => {
    fetchTasks(activeProject?.slug);
  }, [activeProject?.slug, fetchTasks]);

  const handleRefresh = useCallback(() => {
    fetchTasks(activeProject?.slug);
  }, [fetchTasks, activeProject?.slug]);

  const handleSelectProject = useCallback(
    (id: string) => {
      setActiveProject(id);
    },
    [setActiveProject],
  );

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, GatewayTask[]>();
    for (const col of COLUMNS) {
      map.set(col.status, []);
    }
    for (const task of tasks) {
      const arr = map.get(task.status as TaskStatus);
      if (arr) {
        arr.push(task);
      }
      // cancelled tasks are hidden from the board
    }
    // Sort by sort_order within each column
    for (const [, arr] of map) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
    }
    return map;
  }, [tasks]);

  const totalTasks = tasks.filter((t) => t.status !== "cancelled").length;

  // ── Drag and drop ───────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = event.active.id as string;
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        setActiveTask(task);
      }
    },
    [tasks],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over) {
        return;
      }

      const taskId = active.id as string;
      const overData = over.data.current as { type?: string; status?: string } | undefined;

      // Dropped on a column
      if (overData?.type === "task-column" && overData.status) {
        const targetStatus = overData.status as TaskStatus;
        const task = tasks.find((t) => t.id === taskId);
        if (!task) {
          return;
        }
        if (task.status === targetStatus) {
          return;
        }

        // Calculate sort order: place at end of target column
        const targetTasks = tasksByStatus.get(targetStatus) ?? [];
        const lastOrder =
          targetTasks.length > 0 ? targetTasks[targetTasks.length - 1].sort_order : 0;
        const newOrder = lastOrder + 1;

        try {
          await reorderTask(taskId, targetStatus, newOrder);
        } catch {
          toast.error("Failed to move task");
        }
        return;
      }

      // Dropped on another task card — move to that card's column
      if (overData?.type === "task-card") {
        const overTaskId = over.id as string;
        const overTask = tasks.find((t) => t.id === overTaskId);
        const draggedTask = tasks.find((t) => t.id === taskId);
        if (!overTask || !draggedTask) {
          return;
        }
        if (draggedTask.status === overTask.status && draggedTask.id === overTask.id) {
          return;
        }

        const targetStatus = overTask.status as TaskStatus;
        // Place before the target task
        const newOrder = overTask.sort_order - 0.5;

        try {
          await reorderTask(taskId, targetStatus, newOrder);
        } catch {
          toast.error("Failed to move task");
        }
      }
    },
    [tasks, tasksByStatus, reorderTask],
  );

  const handleDragCancel = useCallback(() => {
    setActiveTask(null);
  }, []);

  // ── Empty state ─────────────────────────────────────────────────

  if (error && tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-3">
        <AlertCircle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm">Failed to load tasks</p>
        <p className="text-xs text-muted-foreground/60">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          Retry
        </Button>
      </div>
    );
  }

  // Derive the project ID for creating tasks (use active project or first project)
  const createProjectId = activeProjectId ?? projects[0]?.id ?? "";

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-full bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Gateway Tasks</h2>
            <span className="text-xs text-muted-foreground">
              {totalTasks} task{totalTasks !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ProjectSelector
              projects={projects}
              activeProjectId={activeProjectId}
              onSelect={handleSelectProject}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="h-7 px-2"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Loading indicator */}
        {loading && tasks.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tasks...
            </div>
          </div>
        )}

        {/* No projects state */}
        {!loading && projects.length === 0 && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ListTodo className="h-10 w-10 opacity-40" />
            <p className="text-sm">No task projects yet</p>
            <p className="text-xs text-muted-foreground/60">
              Create a project via the gateway API to get started
            </p>
          </div>
        )}

        {/* Board */}
        {(tasks.length > 0 || projects.length > 0) && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full gap-px bg-border p-2">
              {COLUMNS.map((col) => (
                <TaskColumn
                  key={col.status}
                  column={col}
                  tasks={tasksByStatus.get(col.status) ?? []}
                  projectId={createProjectId}
                  isDragging={!!activeTask}
                  onEditTask={setEditingTask}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeTask && <DragOverlayCard task={activeTask} />}
      </DragOverlay>

      {/* Task detail dialog */}
      {editingTask && <TaskDetail task={editingTask} onClose={() => setEditingTask(null)} />}
    </DndContext>
  );
}
