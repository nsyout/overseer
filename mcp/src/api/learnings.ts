/**
 * Learnings API - typed wrapper around os learning commands
 *
 * Note: Learnings are now added via tasks.complete() with the learnings option.
 * They bubble to immediate parent on completion, aligning with VCS state.
 * This API only provides read access for viewing learnings.
 */
import { callCli } from "../cli.js";
import type { Learning } from "../types.js";

/**
 * Learnings API exposed to VM sandbox
 */
export const learnings = {
  /**
   * List all learnings for a task.
   * Includes learnings bubbled from completed child tasks.
   */
  async list(taskId: string): Promise<Learning[]> {
    return (await callCli(["learning", "list", taskId])) as Learning[];
  },
};
