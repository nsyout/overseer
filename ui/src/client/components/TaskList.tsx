import { useState, useMemo } from "react";
import type { Task, TaskId } from "../../types.js";

type FilterType = "all" | "active" | "completed" | "blocked" | "ready";

interface TaskListProps {
  tasks: Task[];
  selectedId: TaskId | null;
  onSelect: (id: TaskId) => void;
}

/**
 * Hierarchical task list with filters
 */
export function TaskList({ tasks, selectedId, onSelect }: TaskListProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  // Build parent->children map for hierarchy
  const tasksByParent = useMemo(() => {
    const map = new Map<TaskId | null, Task[]>();
    for (const task of tasks) {
      const parentId = task.parentId;
      const existing = map.get(parentId) ?? [];
      existing.push(task);
      map.set(parentId, existing);
    }
    return map;
  }, [tasks]);

  // Get all task IDs that match the filter (and their ancestors)
  const visibleTaskIds = useMemo(() => {
    const matchesFilter = (task: Task): boolean => {
      const isBlocked = (task.blockedBy?.length ?? 0) > 0 && !task.completed;
      const isReady = !task.completed && !isBlocked && !task.startedAt;

      switch (filter) {
        case "all":
          return true;
        case "active":
          return !task.completed;
        case "completed":
          return task.completed;
        case "blocked":
          return isBlocked;
        case "ready":
          return isReady || (task.startedAt !== null && !task.completed);
      }
    };

    // Find all tasks that match filter
    const matching = new Set<TaskId>();
    for (const task of tasks) {
      if (matchesFilter(task)) {
        matching.add(task.id);
      }
    }

    // Add ancestors of matching tasks (so hierarchy is visible)
    const taskMap = new Map<TaskId, Task>(tasks.map((t) => [t.id, t]));
    const withAncestors = new Set<TaskId>(matching);

    for (const id of matching) {
      let current = taskMap.get(id);
      while (current?.parentId) {
        withAncestors.add(current.parentId);
        current = taskMap.get(current.parentId);
      }
    }

    return withAncestors;
  }, [tasks, filter]);

  // Get milestones (depth 0) that are visible
  const visibleMilestones = useMemo(() => {
    return tasks.filter((t) => t.depth === 0 && visibleTaskIds.has(t.id));
  }, [tasks, visibleTaskIds]);

  // Count tasks by filter type for badges
  // Must align with matchesFilter logic above
  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let blocked = 0;
    let ready = 0;

    for (const task of tasks) {
      const isBlocked = (task.blockedBy?.length ?? 0) > 0 && !task.completed;
      // Align with filter: ready OR in-progress (started but not completed)
      const isReadyOrInProgress =
        !task.completed && (!isBlocked || task.startedAt !== null);

      if (task.completed) {
        completed++;
      } else {
        active++;
        if (isBlocked) blocked++;
        if (isReadyOrInProgress) ready++;
      }
    }

    return { all: tasks.length, active, completed, blocked, ready };
  }, [tasks]);

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: "all", label: "All" },
    { type: "active", label: "Active" },
    { type: "completed", label: "Done" },
    { type: "blocked", label: "Blocked" },
    { type: "ready", label: "Ready" },
  ];

  if (tasks.length === 0) {
    return (
      <div className="p-4 text-[var(--color-text-muted)] text-sm">
        No tasks found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--color-border)]">
        {filterButtons.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilter(type)}
            className={`
              px-2 py-1 text-xs rounded transition-colors
              ${
                filter === type
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface-primary)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-secondary)]"
              }
            `}
          >
            {label}
            <span className="ml-1 opacity-70">{counts[type]}</span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2">
        {visibleMilestones.length === 0 ? (
          <div className="p-4 text-[var(--color-text-muted)] text-sm text-center">
            No tasks match filter
          </div>
        ) : (
          <div className="space-y-1">
            {visibleMilestones.map((milestone) => (
              <MilestoneGroup
                key={milestone.id}
                milestone={milestone}
                tasksByParent={tasksByParent}
                visibleTaskIds={visibleTaskIds}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface MilestoneGroupProps {
  milestone: Task;
  tasksByParent: Map<TaskId | null, Task[]>;
  visibleTaskIds: Set<TaskId>;
  selectedId: TaskId | null;
  onSelect: (id: TaskId) => void;
  depth: number;
}

function MilestoneGroup({
  milestone,
  tasksByParent,
  visibleTaskIds,
  selectedId,
  onSelect,
  depth,
}: MilestoneGroupProps) {
  const children = (tasksByParent.get(milestone.id) ?? []).filter((t) =>
    visibleTaskIds.has(t.id)
  );

  return (
    <div>
      <TaskItem
        task={milestone}
        isSelected={selectedId === milestone.id}
        onSelect={onSelect}
        depth={depth}
      />
      {children.length > 0 && (
        <div className="ml-3 border-l border-[var(--color-border)]">
          {children.map((child) => (
            <MilestoneGroup
              key={child.id}
              milestone={child}
              tasksByParent={tasksByParent}
              visibleTaskIds={visibleTaskIds}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskItemProps {
  task: Task;
  isSelected: boolean;
  onSelect: (id: TaskId) => void;
  depth: number;
}

function TaskItem({ task, isSelected, onSelect, depth }: TaskItemProps) {
  const isBlocked = (task.blockedBy?.length ?? 0) > 0 && !task.completed;
  const isInProgress = task.startedAt !== null && !task.completed;

  // Status for aria-label
  const statusLabel = task.completed
    ? "Completed"
    : isBlocked
      ? "Blocked"
      : isInProgress
        ? "In progress"
        : "Pending";

  // Status color
  const statusColor = task.completed
    ? "bg-[var(--color-status-done)]"
    : isBlocked
      ? "bg-[var(--color-status-blocked)]"
      : isInProgress
        ? "bg-[var(--color-status-active)]"
        : "bg-[var(--color-status-pending)]";

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      aria-current={isSelected ? "true" : undefined}
      className={`
        w-full text-left p-2 rounded transition-colors
        ${isSelected ? "bg-[var(--color-surface-secondary)]" : "hover:bg-[var(--color-surface-primary)]"}
        ${depth > 0 ? "pl-4" : ""}
      `}
    >
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        <span
          role="status"
          aria-label={statusLabel}
          className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`}
        />

        {/* Description */}
        <span
          className={`
            text-sm truncate flex-1
            ${task.completed ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text-primary)]"}
          `}
        >
          {task.description}
        </span>

        {/* Priority badge */}
        <span className="text-xs font-mono text-[var(--color-text-muted)]">
          P{task.priority}
        </span>
      </div>
    </button>
  );
}
