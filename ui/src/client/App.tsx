import { useState, useCallback } from "react";
import { useTasks, useTask } from "./lib/queries.js";
import { TaskList } from "./components/TaskList.js";
import { TaskGraph } from "./components/TaskGraph.js";
import { TaskDetail } from "./components/TaskDetail.js";
import type { TaskId } from "../types.js";

/**
 * Main application layout - 3-panel design:
 * - Left sidebar: Task list with filters
 * - Center: Interactive task dependency graph
 * - Right: Task detail panel
 */
export function App() {
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);

  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useTasks();
  const { data: selectedTask } = useTask(selectedTaskId);

  const handleTaskDeleted = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  return (
    <div className="flex h-screen bg-[var(--color-bg-primary)]">
      {/* Left Sidebar - Task List */}
      <aside className="w-80 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden flex flex-col">
        <header className="p-4 border-b border-[var(--color-border)]">
          <h1 className="text-lg font-semibold font-mono text-[var(--color-accent)]">
            Overseer
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Task Viewer</p>
        </header>

        <div className="flex-1 overflow-hidden">
          {tasksLoading ? (
            <div className="p-4 text-[var(--color-text-muted)]">Loading...</div>
          ) : tasksError ? (
            <div className="p-4 text-[var(--color-error)]">
              Error: {tasksError.message}
            </div>
          ) : (
            <TaskList
              tasks={tasks ?? []}
              selectedId={selectedTaskId}
              onSelect={setSelectedTaskId}
            />
          )}
        </div>
      </aside>

      {/* Center - Graph View */}
      <main className="flex-1 flex bg-[var(--color-bg-primary)] min-h-0">
        {tasksLoading ? (
          <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
            Loading...
          </div>
        ) : tasksError ? (
          <div className="flex-1 flex items-center justify-center text-[var(--color-error)]">
            Error: {tasksError.message}
          </div>
        ) : (
          <TaskGraph
            tasks={tasks ?? []}
            selectedId={selectedTaskId}
            onSelect={setSelectedTaskId}
          />
        )}
      </main>

      {/* Right Panel - Task Detail */}
      <aside className="w-96 flex-shrink-0 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden flex flex-col">
        {selectedTask ? (
          <TaskDetail task={selectedTask} onDeleted={handleTaskDeleted} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
            Select a task to view details
          </div>
        )}
      </aside>
    </div>
  );
}
