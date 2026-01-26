/**
 * CLI bridge - spawns `os` binary and parses JSON output
 */
import { spawn } from "node:child_process";
import { CliError, CliTimeoutError } from "./types.js";

const CLI_TIMEOUT_MS = 30_000;

// Allow override via env var (useful for tests)
const CLI_PATH = process.env.OVERSEER_CLI_PATH || "os";
const CLI_CWD = process.env.OVERSEER_CLI_CWD || process.cwd();

/**
 * Execute os CLI command with --json flag
 */
export async function callCli(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLI_PATH, [...args, "--json"], {
      cwd: CLI_CWD,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new CliTimeoutError());
    }, CLI_TIMEOUT_MS);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new CliError(`Failed to spawn os: ${err.message}`, -1, ""));
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        const message = stderr.trim() || `os exited with code ${code}`;
        reject(new CliError(message, code ?? -1, stderr));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (err) {
        reject(
          new CliError(
            `Invalid JSON from os: ${err instanceof Error ? err.message : String(err)}`,
            0,
            stdout
          )
        );
      }
    });
  });
}
