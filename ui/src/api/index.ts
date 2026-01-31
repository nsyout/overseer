import { serve } from "@hono/node-server";
import { app } from "./app.js";

export type { AppType } from "./app.js";

const PORT =
  process.env.PORT === undefined
    ? 6969
    : Number.parseInt(process.env.PORT, 10) || 6969;

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`API server listening on http://localhost:${info.port}`);
  }
);
