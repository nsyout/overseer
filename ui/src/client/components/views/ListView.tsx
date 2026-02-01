/**
 * List view - wraps existing TaskList component.
 * This provides a dedicated view for the task list when in list mode.
 */

import type { Task, TaskId } from "../../../types.js";
import { TaskList } from "../TaskList.js";

interface ListViewProps {
  tasks: Task[];
  selectedId: TaskId | null;
  onSelect: (id: TaskId) => void;
}

export function ListView({ tasks, selectedId, onSelect }: ListViewProps) {
  return (
    <div className="flex-1 flex bg-bg-primary">
      <div className="flex-1 max-w-4xl mx-auto py-4">
        <TaskList tasks={tasks} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  );
}
