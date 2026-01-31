import { hc } from "hono/client";
import type { AppType } from "../../api/app.js";

/**
 * Type-safe RPC client for the Overseer API.
 * Uses Hono's hc() for full type inference from AppType.
 */
export const api = hc<AppType>(
  typeof window !== "undefined" ? window.location.origin : "http://localhost:6969"
);

export type { AppType };
