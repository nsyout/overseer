import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { tasks } from "./routes/tasks.js";

const app = new Hono()
  .get("/health", (c) => {
    return c.json({ status: "ok" });
  })
  .route("/api/tasks", tasks)
  // Catch-all for undefined API routes (must be before static middleware)
  .all("/api/*", (c) => c.json({ error: "Not found" }, 404))
  // Serve static files from dist/ in production
  .use("/*", serveStatic({ root: "./dist" }))
  // Fallback to index.html for SPA routing
  .get("/*", serveStatic({ root: "./dist", path: "index.html" }));

export { app };
export type AppType = typeof app;
