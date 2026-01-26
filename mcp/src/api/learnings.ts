/**
 * Learnings API - typed wrapper around os learning commands
 */
import { callCli } from "../cli.js";
import type { Learning } from "../types.js";

/**
 * Learnings API exposed to VM sandbox
 */
export const learnings = {
  /**
   * Add learning to a task
   */
  async add(
    taskId: string,
    content: string,
    sourceTaskId?: string
  ): Promise<Learning> {
    const args = ["learning", "add", taskId, content];
    if (sourceTaskId) args.push("--source", sourceTaskId);
    return (await callCli(args)) as Learning;
  },

  /**
   * List all learnings for a task
   */
  async list(taskId: string): Promise<Learning[]> {
    return (await callCli(["learning", "list", taskId])) as Learning[];
  },

  /**
   * Delete a learning
   */
  async delete(id: string): Promise<void> {
    await callCli(["learning", "delete", id]);
  },
};
