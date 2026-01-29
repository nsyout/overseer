import { serve } from "@hono/node-server";
import { app } from "./app.js";

export type { AppType } from "./app.js";

const PORT =
  process.env.PORT === undefined
    ? 3001
    : Number.parseInt(process.env.PORT, 10) || 3001;

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`API server running on http://localhost:${info.port}`);
  }
);
