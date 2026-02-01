/**
 * Kanban view placeholder - shows tasks grouped by status columns.
 * To be implemented with actual kanban board functionality.
 */

import type { Task, TaskId } from "../../../types.js";

interface KanbanViewProps {
  tasks: Task[];
  selectedId: TaskId | null;
  onSelect: (id: TaskId) => void;
}

export function KanbanView({ tasks }: KanbanViewProps) {
  // Group tasks by status
  const pending = tasks.filter(
    (t) => !t.completed && !t.startedAt && (t.blockedBy?.length ?? 0) === 0
  );
  const active = tasks.filter((t) => t.startedAt && !t.completed);
  const blocked = tasks.filter(
    (t) => !t.completed && (t.blockedBy?.length ?? 0) > 0
  );
  const done = tasks.filter((t) => t.completed);

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-8">
      <div className="text-center space-y-4">
        <div className="text-4xl" aria-hidden="true">🚧</div>
        <h2 className="text-xl font-mono text-text-primary">Kanban View</h2>
        <p className="text-sm max-w-md">
          Coming soon. Will display tasks in columns by status.
        </p>
        <div className="flex gap-4 text-xs font-mono mt-4">
          <div className="px-3 py-2 bg-surface-primary rounded">
            <span className="text-status-pending">Ready</span>
            <span className="ml-2 text-text-dim">{pending.length}</span>
          </div>
          <div className="px-3 py-2 bg-surface-primary rounded">
            <span className="text-status-active">Active</span>
            <span className="ml-2 text-text-dim">{active.length}</span>
          </div>
          <div className="px-3 py-2 bg-surface-primary rounded">
            <span className="text-status-blocked">Blocked</span>
            <span className="ml-2 text-text-dim">{blocked.length}</span>
          </div>
          <div className="px-3 py-2 bg-surface-primary rounded">
            <span className="text-status-done">Done</span>
            <span className="ml-2 text-text-dim">{done.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
