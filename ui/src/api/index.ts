import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

export type { AppType } from "./app.js";

const PORT =
  process.env.PORT === undefined
    ? 8787
    : Number.parseInt(process.env.PORT, 10) || 8787;

// Static root:
// - Dev: ./dist (vite output, relative to ui/)
// - Prod: OVERSEER_UI_STATIC_ROOT env var (set by bin/os)
const staticRoot = process.env.OVERSEER_UI_STATIC_ROOT ?? "./dist";

const app = createApp(staticRoot);

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`Overseer UI: http://localhost:${info.port}`);
  }
);
