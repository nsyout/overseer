/**
 * VCS API - typed wrapper around os vcs commands
 */
import { callCli } from "../cli.js";
import type {
  VcsDetectResult,
  VcsStatus,
  LogEntry,
  DiffEntry,
  CommitResult,
} from "../types.js";

/**
 * VCS API exposed to VM sandbox
 */
export const vcs = {
  /**
   * Detect VCS type and root
   */
  async detect(): Promise<VcsDetectResult> {
    return (await callCli(["vcs", "detect"])) as VcsDetectResult;
  },

  /**
   * Get working copy status
   */
  async status(): Promise<VcsStatus> {
    return (await callCli(["vcs", "status"])) as VcsStatus;
  },

  /**
   * Get commit history
   */
  async log(limit?: number): Promise<LogEntry[]> {
    const args = ["vcs", "log"];
    if (limit) args.push("--limit", String(limit));
    return (await callCli(args)) as LogEntry[];
  },

  /**
   * Get diff from base (defaults to parent commit)
   */
  async diff(base?: string): Promise<DiffEntry[]> {
    const args = ["vcs", "diff"];
    if (base) args.push(base);
    return (await callCli(args)) as DiffEntry[];
  },

  /**
   * Create commit (auto-stages for git, describe+new for jj)
   */
  async commit(message: string): Promise<CommitResult> {
    return (await callCli(["vcs", "commit", "-m", message])) as CommitResult;
  },
};
