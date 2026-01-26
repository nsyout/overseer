#!/usr/bin/env node
/**
 * Overseer MCP Server entry point
 */
import { startServer } from "./server.js";

startServer().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
