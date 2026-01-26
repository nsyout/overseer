/**
 * Tasks API - typed wrapper around os task commands
 */
import { callCli } from "../cli.js";
import type { Task } from "../types.js";

export interface TaskFilter {
  parentId?: string;
  ready?: boolean;
  completed?: boolean;
}

export interface CreateTaskInput {
  description: string;
  context?: string;
  parentId?: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  blockedBy?: string[];
}

export interface UpdateTaskInput {
  description?: string;
  context?: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  parentId?: string;
}

/**
 * Tasks API exposed to VM sandbox
 */
export const tasks = {
  /**
   * List tasks with optional filters
   */
  async list(filter?: TaskFilter): Promise<Task[]> {
    const args = ["task", "list"];
    if (filter?.parentId) args.push("--parent", filter.parentId);
    if (filter?.ready) args.push("--ready");
    if (filter?.completed) args.push("--completed");
    return (await callCli(args)) as Task[];
  },

  /**
   * Get single task with full context and learnings
   */
  async get(id: string): Promise<Task> {
    return (await callCli(["task", "get", id])) as Task;
  },

  /**
   * Create new task
   */
  async create(input: CreateTaskInput): Promise<Task> {
    const args = ["task", "create", "-d", input.description];
    if (input.context) args.push("--context", input.context);
    if (input.parentId) args.push("--parent", input.parentId);
    if (input.priority) args.push("--priority", String(input.priority));
    if (input.blockedBy && input.blockedBy.length > 0) {
      args.push("--blocked-by", input.blockedBy.join(","));
    }
    return (await callCli(args)) as Task;
  },

  /**
   * Update existing task
   */
  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const args = ["task", "update", id];
    if (input.description) args.push("-d", input.description);
    if (input.context) args.push("--context", input.context);
    if (input.priority) args.push("--priority", String(input.priority));
    if (input.parentId) args.push("--parent", input.parentId);
    return (await callCli(args)) as Task;
  },

  /**
   * Mark task as started
   */
  async start(id: string): Promise<Task> {
    return (await callCli(["task", "start", id])) as Task;
  },

  /**
   * Complete task with optional result
   */
  async complete(id: string, result?: string): Promise<Task> {
    const args = ["task", "complete", id];
    if (result) args.push("--result", result);
    return (await callCli(args)) as Task;
  },

  /**
   * Reopen completed task
   */
  async reopen(id: string): Promise<Task> {
    return (await callCli(["task", "reopen", id])) as Task;
  },

  /**
   * Delete task (cascades to children)
   */
  async delete(id: string): Promise<void> {
    await callCli(["task", "delete", id]);
  },

  /**
   * Add blocker relationship
   */
  async block(taskId: string, blockerId: string): Promise<void> {
    await callCli(["task", "block", taskId, "--by", blockerId]);
  },

  /**
   * Remove blocker relationship
   */
  async unblock(taskId: string, blockerId: string): Promise<void> {
    await callCli(["task", "unblock", taskId, "--by", blockerId]);
  },

  /**
   * Get next ready task
   */
  async nextReady(milestoneId?: string): Promise<Task | null> {
    const args = ["task", "next-ready"];
    if (milestoneId) args.push("--milestone", milestoneId);
    return (await callCli(args)) as Task | null;
  },
};
