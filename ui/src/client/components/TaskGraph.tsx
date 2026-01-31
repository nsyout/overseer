import { useMemo, useCallback, memo } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { Task, TaskId } from "../../types.js";

import "@xyflow/react/dist/style.css";

// Node dimensions
const NODE_WIDTH = 280;
const NODE_HEIGHT = 80;

// Custom data for task nodes - needs index signature for xyflow
interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  childCount: number;
  isSelected: boolean;
  onSelect: (id: TaskId) => void;
}

type TaskNode = Node<TaskNodeData, "task">;
type TaskEdge = Edge;

/** Type guard for TaskNodeData */
function isTaskNodeData(data: unknown): data is TaskNodeData {
  return (
    data !== null &&
    typeof data === "object" &&
    "task" in data &&
    "childCount" in data &&
    "isSelected" in data &&
    "onSelect" in data
  );
}

interface TaskGraphProps {
  tasks: Task[];
  selectedId: TaskId | null;
  onSelect: (id: TaskId) => void;
}

/**
 * Apply dagre layout to nodes and edges
 */
function getLayoutedElements(
  nodes: TaskNode[],
  edges: TaskEdge[],
): { nodes: TaskNode[]; edges: TaskEdge[] } {
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Only use parent edges for layout (not blocker edges)
  edges
    .filter((edge) => edge.data?.type === "parent")
    .forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Build nodes and edges from tasks
 */
function buildGraphElements(
  tasks: Task[],
  selectedId: TaskId | null,
  onSelect: (id: TaskId) => void,
): { nodes: TaskNode[]; edges: TaskEdge[] } {
  // Build child count map
  const childCounts = new Map<TaskId, number>();
  for (const task of tasks) {
    if (task.parentId) {
      childCounts.set(task.parentId, (childCounts.get(task.parentId) ?? 0) + 1);
    }
  }

  // Create nodes
  const nodes: TaskNode[] = tasks.map((task) => ({
    id: task.id,
    type: "task",
    position: { x: 0, y: 0 }, // Will be set by dagre
    data: {
      task,
      childCount: childCounts.get(task.id) ?? 0,
      isSelected: task.id === selectedId,
      onSelect,
    },
  }));

  // Create edges
  const edges: TaskEdge[] = [];
  const taskIds = new Set(tasks.map((t) => t.id));

  for (const task of tasks) {
    // Parent → child edges (solid)
    if (task.parentId && taskIds.has(task.parentId)) {
      edges.push({
        id: `parent-${task.parentId}-${task.id}`,
        source: task.parentId,
        target: task.id,
        type: "smoothstep",
        style: { stroke: "var(--color-border)", strokeWidth: 2 },
        data: { type: "parent" },
      });
    }

    // BlockedBy edges (dashed orange)
    if (task.blockedBy) {
      for (const blockerId of task.blockedBy) {
        if (taskIds.has(blockerId)) {
          edges.push({
            id: `blocker-${blockerId}-${task.id}`,
            source: blockerId,
            target: task.id,
            type: "smoothstep",
            animated: true,
            style: {
              stroke: "var(--color-accent)",
              strokeWidth: 2,
              strokeDasharray: "5,5",
            },
            data: { type: "blocker" },
          });
        }
      }
    }
  }

  return getLayoutedElements(nodes, edges);
}

/**
 * Custom task node component
 */
const TaskNodeComponent = memo(function TaskNodeComponent({
  data,
}: NodeProps<TaskNode>) {
  const { task, childCount, isSelected, onSelect } = data;

  const isBlocked = (task.blockedBy?.length ?? 0) > 0 && !task.completed;
  const isInProgress = task.startedAt !== null && !task.completed;

  const depthLabel =
    task.depth === 0 ? "Milestone" : task.depth === 1 ? "Task" : "Subtask";

  // Status styling
  const statusColor = task.completed
    ? "var(--color-success)"
    : isBlocked
      ? "var(--color-error)"
      : isInProgress
        ? "var(--color-accent)"
        : "var(--color-text-muted)";

  const statusLabel = task.completed
    ? "Done"
    : isBlocked
      ? "Blocked"
      : isInProgress
        ? "Active"
        : "Pending";

  const handleClick = useCallback(() => {
    onSelect(task.id);
  }, [onSelect, task.id]);

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        onClick={handleClick}
        className={`
          cursor-pointer rounded-lg border-2 p-3 transition-all
          bg-[var(--color-surface-primary)]
          ${isSelected ? "border-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/20" : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"}
        `}
        style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: statusColor }}
            />
            {/* Depth label */}
            <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-muted)]">
              {depthLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Status badge */}
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
                color: statusColor,
              }}
            >
              {statusLabel}
            </span>
            {/* Priority */}
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
              P{task.priority}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-[var(--color-text-primary)] line-clamp-2 leading-tight">
          {task.description}
        </p>

        {/* Footer */}
        {childCount > 0 && (
          <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
              {childCount} {childCount === 1 ? "child" : "children"}
            </span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
});

const nodeTypes = {
  task: TaskNodeComponent,
};

/**
 * Interactive task dependency graph
 */
export function TaskGraph({ tasks, selectedId, onSelect }: TaskGraphProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraphElements(tasks, selectedId, onSelect),
    [tasks, selectedId, onSelect],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // MiniMap node color based on status
  const getNodeColor = useCallback((node: Node) => {
    const data = node.data;
    if (!isTaskNodeData(data)) return "var(--color-text-muted)";

    const task = data.task;
    const isBlocked = (task.blockedBy?.length ?? 0) > 0 && !task.completed;
    const isInProgress = task.startedAt !== null && !task.completed;

    if (task.completed) return "var(--color-success)";
    if (isBlocked) return "var(--color-error)";
    if (isInProgress) return "var(--color-accent)";
    return "var(--color-text-muted)";
  }, []);

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
        <p>No tasks to display</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0" style={{ minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-border)"
        />
        <Controls
          showInteractive={false}
          style={{
            backgroundColor: "var(--color-surface-primary)",
            borderColor: "var(--color-border)",
          }}
        />
        <MiniMap
          nodeColor={getNodeColor}
          maskColor="rgba(0, 0, 0, 0.8)"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
          }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
