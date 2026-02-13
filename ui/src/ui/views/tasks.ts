import { html, nothing } from "lit";
import type { Task, TaskStatus, TasksProps } from "./tasks-types.ts";

const STATUS_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "gray" },
  { status: "todo", label: "To Do", color: "blue" },
  { status: "in_progress", label: "In Progress", color: "yellow" },
  { status: "blocked", label: "Blocked", color: "red" },
  { status: "review", label: "Review", color: "purple" },
  { status: "done", label: "Done", color: "green" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "red",
  high: "orange",
  medium: "blue",
  low: "gray",
  none: "transparent",
};

function parseLabels(labelsJson: string): string[] {
  try {
    const parsed = JSON.parse(labelsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

let draggedTaskId: string | null = null;
let draggedFromStatus: TaskStatus | null = null;

export function renderTasks(props: TasksProps) {
  const selectedProject = props.projects.find((p) => p.slug === props.selectedProject);

  return html`
    <div class="tasks-container">
      <!-- Top bar -->
      <div class="tasks-header">
        <div class="tasks-header-left">
          <label class="field">
            <span>Project</span>
            <select
              @change=${(e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                props.onProjectSelect(value === "" ? null : value);
              }}
              .value=${props.selectedProject ?? ""}
            >
              <option value="">All Projects</option>
              ${props.projects.map((p) => html`<option value=${p.slug}>${p.name}</option>`)}
            </select>
          </label>
        </div>
        <div class="tasks-header-right">
          <button class="btn" @click=${props.onRefresh} ?disabled=${props.loading}>
            ${props.loading ? "Refreshing…" : "Refresh"}
          </button>
          <button class="btn primary" @click=${() => showNewTaskDialog(props)}>
            New Task
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="error-message">${props.error}</div>` : nothing}

      <!-- Kanban board -->
      <div class="kanban-board">
        ${STATUS_COLUMNS.map((col) => renderColumn(col, props))}
      </div>
    </div>
  `;
}

function renderColumn(
  col: { status: TaskStatus; label: string; color: string },
  props: TasksProps,
) {
  const tasksInColumn = props.tasks.filter((t) => t.status === col.status);

  return html`
    <div
      class="kanban-column"
      data-status=${col.status}
      @dragover=${(e: DragEvent) => handleDragOver(e, col.status)}
      @drop=${(e: DragEvent) => handleDrop(e, col.status, props)}
    >
      <div class="kanban-column-header" data-color=${col.color}>
        <span class="kanban-column-title">${col.label}</span>
        <span class="kanban-column-count">${tasksInColumn.length}</span>
      </div>
      <div class="kanban-column-body">
        ${tasksInColumn.map((task) => renderTaskCard(task, props))}
      </div>
    </div>
  `;
}

function renderTaskCard(task: Task, props: TasksProps) {
  const labels = parseLabels(task.labels);
  const priorityColor = PRIORITY_COLORS[task.priority] || "gray";

  return html`
    <div
      class="kanban-card"
      draggable="true"
      data-task-id=${task.id}
      @dragstart=${(e: DragEvent) => handleDragStart(e, task)}
      @dragend=${handleDragEnd}
      @click=${() => toggleTaskDetails(task.id)}
    >
      <div class="kanban-card-header">
        <div class="kanban-card-title">${task.title}</div>
        ${
          task.priority !== "none"
            ? html`<span class="priority-badge" data-priority=${task.priority} style="background-color: var(--c-priority-${priorityColor})"
              >${task.priority}</span
            >`
            : nothing
        }
      </div>
      ${
        task.description
          ? html`<div class="kanban-card-description">${task.description}</div>`
          : nothing
      }
      <div class="kanban-card-footer">
        ${task.assigned_to ? html`<span class="assignee-chip">${task.assigned_to}</span>` : nothing}
        ${labels.map((label) => html`<span class="label-chip">${label}</span>`)}
        ${task.due_date ? html`<span class="due-date">${formatDate(task.due_date)}</span>` : nothing}
      </div>
      <div class="kanban-card-details" data-task-id=${task.id} style="display: none;">
        ${renderTaskDetails(task, props)}
      </div>
    </div>
  `;
}

function renderTaskDetails(task: Task, props: TasksProps) {
  return html`
    <div class="task-details">
      <div class="task-details-header">
        <h3>${task.title}</h3>
        <button class="btn small danger" @click=${(e: Event) => {
          e.stopPropagation();
          if (confirm("Delete this task?")) {
            props.onTaskDelete(task.id);
          }
        }}>Delete</button>
      </div>
      <div class="task-details-body">
        <label class="field">
          <span>Title</span>
          <input
            type="text"
            .value=${task.title}
            @change=${(e: Event) => {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value && value !== task.title) {
                props.onTaskUpdate(task.id, { title: value });
              }
            }}
          />
        </label>
        <label class="field">
          <span>Description</span>
          <textarea
            rows="3"
            .value=${task.description ?? ""}
            @change=${(e: Event) => {
              const value = (e.target as HTMLTextAreaElement).value.trim();
              props.onTaskUpdate(task.id, { description: value || null });
            }}
          ></textarea>
        </label>
        <div class="form-grid">
          <label class="field">
            <span>Priority</span>
            <select
              .value=${task.priority}
              @change=${(e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                props.onTaskUpdate(task.id, { priority: value as any });
              }}
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label class="field">
            <span>Assigned To</span>
            <input
              type="text"
              .value=${task.assigned_to ?? ""}
              @change=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value.trim();
                props.onTaskUpdate(task.id, { assigned_to: value || null });
              }}
            />
          </label>
        </div>
      </div>
    </div>
  `;
}

function toggleTaskDetails(taskId: string) {
  const card = document.querySelector(`.kanban-card[data-task-id="${taskId}"]`);
  if (!card) {
    return;
  }
  const details = card.querySelector(
    `.kanban-card-details[data-task-id="${taskId}"]`,
  ) as HTMLElement;
  if (!details) {
    return;
  }
  const isVisible = details.style.display !== "none";
  details.style.display = isVisible ? "none" : "block";
}

function showNewTaskDialog(props: TasksProps) {
  const projectId = props.projects.find((p) => p.slug === props.selectedProject)?.id;
  if (!projectId && !props.selectedProject) {
    alert("Please select a project first");
    return;
  }

  const title = prompt("Task title:");
  if (!title) {
    return;
  }

  const actualProjectId = projectId || props.projects[0]?.id;
  if (!actualProjectId) {
    alert("No project available");
    return;
  }

  props.onTaskCreate({
    project_id: actualProjectId,
    title,
    status: "backlog",
    priority: "medium",
  });
}

function handleDragStart(e: DragEvent, task: Task) {
  draggedTaskId = task.id;
  draggedFromStatus = task.status;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
  }
  const target = e.currentTarget as HTMLElement;
  target.classList.add("dragging");
}

function handleDragEnd(e: DragEvent) {
  const target = e.currentTarget as HTMLElement;
  target.classList.remove("dragging");
  draggedTaskId = null;
  draggedFromStatus = null;
}

function handleDragOver(e: DragEvent, targetStatus: TaskStatus) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
}

function handleDrop(e: DragEvent, targetStatus: TaskStatus, props: TasksProps) {
  e.preventDefault();
  if (!draggedTaskId) {
    return;
  }

  const task = props.tasks.find((t) => t.id === draggedTaskId);
  if (!task) {
    return;
  }

  // If status hasn't changed, no reorder needed
  if (task.status === targetStatus) {
    return;
  }

  // Calculate new sort_order (insert at end of column)
  const tasksInTargetColumn = props.tasks.filter((t) => t.status === targetStatus);
  const maxSortOrder = Math.max(...tasksInTargetColumn.map((t) => t.sort_order), 0);
  const newSortOrder = maxSortOrder + 1;

  props.onTaskReorder(draggedTaskId, targetStatus, newSortOrder);
}
