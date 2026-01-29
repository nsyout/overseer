import { hc } from "hono/client";
import type { AppType } from "./api/app.js";

/**
 * Creates a type-safe RPC client for the Overseer API.
 * Usage: const client = createClient("http://localhost:3001");
 */
export function createClient(baseUrl: string) {
  return hc<AppType>(baseUrl);
}

export type { AppType };
