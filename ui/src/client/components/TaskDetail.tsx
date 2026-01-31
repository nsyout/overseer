import { useState, useCallback, useEffect } from "react";
import {
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
  useLearnings,
} from "../lib/queries.js";
import type { TaskWithContext, TaskId, Learning } from "../../types.js";

interface TaskDetailProps {
  task: TaskWithContext;
  onDeleted?: () => void;
}

type EditMode = "none" | "description" | "context" | "priority";

/**
 * Task detail panel with edit/complete/delete functionality
 */
export function TaskDetail({ task, onDeleted }: TaskDetailProps) {
  const [editMode, setEditMode] = useState<EditMode>("none");
  const [editValue, setEditValue] = useState("");
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [completeResult, setCompleteResult] = useState("");

  const { data: learnings } = useLearnings(task.id);
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  const depthLabel =
    task.depth === 0 ? "Milestone" : task.depth === 1 ? "Task" : "Subtask";

  const isBlocked = (task.blockedBy?.length ?? 0) > 0;

  const startEdit = useCallback((mode: EditMode, value: string) => {
    setEditMode(mode);
    setEditValue(value);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditMode("none");
    setEditValue("");
  }, []);

  const saveEdit = useCallback(() => {
    if (editMode === "none") return;

    const data: Record<string, unknown> = {};
    if (editMode === "description") {
      data.description = editValue;
    } else if (editMode === "context") {
      data.context = editValue;
    } else if (editMode === "priority") {
      const priority = parseInt(editValue, 10);
      if (priority >= 1 && priority <= 5) {
        data.priority = priority;
      }
    }

    updateTask.mutate(
      { id: task.id, data },
      {
        onSuccess: () => cancelEdit(),
      },
    );
  }, [editMode, editValue, task.id, updateTask, cancelEdit]);

  const handleComplete = useCallback(() => {
    completeTask.mutate(
      {
        id: task.id,
        data: completeResult ? { result: completeResult } : undefined,
      },
      {
        onSuccess: () => {
          setShowCompleteDialog(false);
          setCompleteResult("");
        },
      },
    );
  }, [task.id, completeResult, completeTask]);

  const handleDelete = useCallback(() => {
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        onDeleted?.();
      },
    });
  }, [task.id, deleteTask, onDeleted]);

  useEffect(() => {
    cancelEdit();
  }, [task.id, cancelEdit]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--color-surface-primary)] text-[var(--color-text-muted)]">
            {depthLabel}
          </span>
          <StatusBadge task={task} />
        </div>
        {editMode === "description" ? (
          <EditField
            value={editValue}
            onChange={setEditValue}
            onSave={saveEdit}
            onCancel={cancelEdit}
            multiline
            saving={updateTask.isPending}
          />
        ) : (
          <h2
            className="text-lg font-medium cursor-pointer hover:text-[var(--color-accent)] transition-colors"
            onClick={() => startEdit("description", task.description)}
            title="Click to edit"
          >
            {task.description}
          </h2>
        )}
      </header>

      {/* Content */}
      <dl className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ID */}
        <Field label="ID">
          <code className="font-mono text-xs text-[var(--color-text-muted)] break-all select-all">
            {task.id}
          </code>
        </Field>

        {/* Priority */}
        <Field label="Priority">
          {editMode === "priority" ? (
            <EditField
              value={editValue}
              onChange={setEditValue}
              onSave={saveEdit}
              onCancel={cancelEdit}
              type="number"
              min={1}
              max={5}
              saving={updateTask.isPending}
            />
          ) : (
            <span
              className="font-mono cursor-pointer hover:text-[var(--color-accent)] transition-colors"
              onClick={() => startEdit("priority", String(task.priority))}
              title="Click to edit (1-5)"
            >
              P{task.priority}
            </span>
          )}
        </Field>

        {/* Context */}
        <Field label="Context">
          {editMode === "context" ? (
            <EditField
              value={editValue}
              onChange={setEditValue}
              onSave={saveEdit}
              onCancel={cancelEdit}
              multiline
              saving={updateTask.isPending}
            />
          ) : (
            <pre
              className="text-sm whitespace-pre-wrap font-mono bg-[var(--color-surface-primary)] p-2 rounded text-[var(--color-text-muted)] cursor-pointer hover:border-[var(--color-accent)] border border-transparent transition-colors"
              onClick={() => startEdit("context", task.context.own)}
              title="Click to edit"
            >
              {task.context.own || "(empty)"}
            </pre>
          )}
        </Field>

        {/* Result (read-only, only shown when completed) */}
        {task.result && (
          <Field label="Result">
            <pre className="text-sm whitespace-pre-wrap font-mono bg-[var(--color-surface-primary)] p-2 rounded">
              {task.result}
            </pre>
          </Field>
        )}

        {/* Blockers */}
        {task.blockedBy && task.blockedBy.length > 0 && (
          <Field label="Blocked By">
            <ul className="text-sm space-y-1">
              {task.blockedBy.map((blockerId: TaskId) => (
                <li
                  key={blockerId}
                  className="font-mono text-xs text-[var(--color-status-blocked)]"
                >
                  {blockerId}
                </li>
              ))}
            </ul>
          </Field>
        )}

        {/* Blocks */}
        {task.blocks && task.blocks.length > 0 && (
          <Field label="Blocks">
            <ul className="text-sm space-y-1">
              {task.blocks.map((blockedId: TaskId) => (
                <li
                  key={blockedId}
                  className="font-mono text-xs text-[var(--color-text-muted)]"
                >
                  {blockedId}
                </li>
              ))}
            </ul>
          </Field>
        )}

        {/* Learnings */}
        {learnings && learnings.length > 0 && (
          <Field label={`Learnings (${learnings.length})`}>
            <ul className="text-sm space-y-2">
              {learnings.map((learning: Learning) => (
                <li
                  key={learning.id}
                  className="font-mono text-xs p-2 bg-[var(--color-surface-primary)] rounded border-l-2 border-[var(--color-accent)]"
                >
                  {learning.content}
                </li>
              ))}
            </ul>
          </Field>
        )}

        {/* Timestamps */}
        <Field label="Created">
          <time className="text-sm text-[var(--color-text-muted)]">
            {new Date(task.createdAt).toLocaleString()}
          </time>
        </Field>

        {task.startedAt && (
          <Field label="Started">
            <time className="text-sm text-[var(--color-text-muted)]">
              {new Date(task.startedAt).toLocaleString()}
            </time>
          </Field>
        )}

        {task.completedAt && (
          <Field label="Completed">
            <time className="text-sm text-[var(--color-text-muted)]">
              {new Date(task.completedAt).toLocaleString()}
            </time>
          </Field>
        )}

        {task.commitSha && (
          <Field label="Commit">
            <code className="font-mono text-xs text-[var(--color-text-muted)]">
              {task.commitSha}
            </code>
          </Field>
        )}
      </dl>

      {/* Action Buttons */}
      {!task.completed && (
        <footer className="p-4 border-t border-[var(--color-border)] space-y-2">
          <button
            type="button"
            onClick={() => setShowCompleteDialog(true)}
            disabled={isBlocked}
            className={`
              w-full py-2 px-4 rounded font-medium text-sm transition-colors
              ${
                isBlocked
                  ? "bg-[var(--color-surface-primary)] text-[var(--color-text-muted)] cursor-not-allowed"
                  : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/80"
              }
            `}
            title={isBlocked ? "Complete blockers first" : "Complete this task"}
          >
            {isBlocked ? "Blocked" : "Complete Task"}
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="w-full py-2 px-4 rounded font-medium text-sm bg-[var(--color-surface-primary)] text-[var(--color-status-blocked)] hover:bg-[var(--color-status-blocked)]/20 transition-colors"
          >
            Delete Task
          </button>
        </footer>
      )}

      {/* Complete Dialog */}
      {showCompleteDialog && (
        <Dialog
          title="Complete Task"
          onClose={() => setShowCompleteDialog(false)}
        >
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Add an optional result summary for this task.
          </p>
          <textarea
            value={completeResult}
            onChange={(e) => setCompleteResult(e.target.value)}
            placeholder="What was accomplished? (optional)"
            rows={4}
            className="w-full p-2 rounded bg-[var(--color-surface-primary)] border border-[var(--color-border)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setShowCompleteDialog(false)}
              className="flex-1 py-2 px-4 rounded text-sm bg-[var(--color-surface-primary)] hover:bg-[var(--color-border)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={completeTask.isPending}
              className="flex-1 py-2 px-4 rounded text-sm bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/80 transition-colors disabled:opacity-50"
            >
              {completeTask.isPending ? "Completing..." : "Complete"}
            </button>
          </div>
          {completeTask.isError && (
            <p className="text-sm text-[var(--color-status-blocked)] mt-2">
              {completeTask.error.message}
            </p>
          )}
        </Dialog>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <Dialog
          title="Delete Task"
          onClose={() => setShowDeleteDialog(false)}
        >
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Are you sure you want to delete this task? This action cannot be
            undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="flex-1 py-2 px-4 rounded text-sm bg-[var(--color-surface-primary)] hover:bg-[var(--color-border)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteTask.isPending}
              className="flex-1 py-2 px-4 rounded text-sm bg-[var(--color-status-blocked)] text-white hover:bg-[var(--color-status-blocked)]/80 transition-colors disabled:opacity-50"
            >
              {deleteTask.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
          {deleteTask.isError && (
            <p className="text-sm text-[var(--color-status-blocked)] mt-2">
              {deleteTask.error.message}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

function StatusBadge({ task }: { task: TaskWithContext }) {
  const isBlocked = (task.blockedBy?.length ?? 0) > 0 && !task.completed;
  const isInProgress = task.startedAt !== null && !task.completed;

  const statusColor = task.completed
    ? "var(--color-status-done)"
    : isBlocked
      ? "var(--color-status-blocked)"
      : isInProgress
        ? "var(--color-status-active)"
        : "var(--color-status-pending)";

  const statusLabel = task.completed
    ? "Completed"
    : isBlocked
      ? "Blocked"
      : isInProgress
        ? "In Progress"
        : "Pending";

  return (
    <span
      className="text-xs font-mono px-2 py-0.5 rounded"
      style={{
        backgroundColor: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
        color: statusColor,
      }}
    >
      {statusLabel}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field-group">
      <dt className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
        {label}
      </dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

interface EditFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  multiline?: boolean;
  type?: string;
  min?: number;
  max?: number;
  saving?: boolean;
}

function EditField({
  value,
  onChange,
  onSave,
  onCancel,
  multiline,
  type = "text",
  min,
  max,
  saving,
}: EditFieldProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === "Enter" && !multiline) {
      onSave();
    } else if (e.key === "Enter" && e.metaKey) {
      onSave();
    }
  };

  const inputClasses =
    "w-full p-2 rounded bg-[var(--color-surface-primary)] border border-[var(--color-accent)] text-sm font-mono focus:outline-none";

  return (
    <div className="space-y-2">
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          className={inputClasses}
          autoFocus
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          min={min}
          max={max}
          className={inputClasses}
          autoFocus
        />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs rounded bg-[var(--color-surface-primary)] hover:bg-[var(--color-border)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1 text-xs rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/80 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Dialog({ title, onClose, children }: DialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
