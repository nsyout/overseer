# Overseer Task Viewer — Feature Spec

**Status:** Approved  
**Effort:** L-XL (3-5 days)  
**Created:** 2026-01-28

---

## Problem Statement

Agents using Overseer via MCP have no visual way to inspect the task store state. Debugging task hierarchies, blocked dependencies, and context inheritance requires raw CLI commands. A local webapp would provide:

- At-a-glance understanding of milestone/task/subtask relationships
- Visual dependency graph (blockedBy edges)
- Quick edits without CLI syntax

## Constraints

| Constraint | Value |
|------------|-------|
| Deployment | Local-only, no auth |
| Port | :6969 (default) |
| VCS operations | Through existing workflow service (complete only) |
| Browser support | Modern (Chrome/Firefox/Safari) |
| Data freshness | Polling @ 5 seconds |
| Static file serving | Filesystem (`ui/web/dist/`) |

## Non-Goals (v1)

- Create new tasks (use CLI/MCP)
- Change parent relationships
- Add/remove blockers
- Start tasks
- Multi-datastore support
- Remote/hosted deployment

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| CLI command | Rust (`os ui`) | Consistent with existing CLI |
| API server | Hono | Type-safe RPC client via `hc<AppType>()` |
| Frontend framework | Astro (static) | Fast, minimal JS, React islands |
| UI components | React + shadcn/ui | Custom nodes, dark theme |
| Graph visualization | @xyflow/react + dagre | Interactive, custom nodes, auto-layout |
| Data fetching | TanStack Query | Stable, simple polling |
| Styling | Tailwind CSS v4 | CSS-first config, OKLCH colors |

---

## Architecture

```
+-------------------------------------------------------------+
|                    os ui (Rust CLI)                         |
|  - Spawns Hono server on :6969                              |
|  - Opens browser                                            |
|  - Serves Astro static build + API                          |
+-------------------------------------------------------------+
                              |
         +--------------------+--------------------+
         v                                         v
+---------------------+                 +---------------------+
|   Astro Frontend    |                 |    Hono API         |
|   (Static Build)    |  <-- fetch -->  |    (/api/*)         |
|                     |                 |                     |
| - Task list view    |                 | GET  /api/tasks     |
| - Dependency graph  |                 | GET  /api/tasks/:id |
| - Detail panel      |                 | PUT  /api/tasks/:id |
| - Edit forms        |                 | DEL  /api/tasks/:id |
|                     |                 | POST /api/tasks/:id |
| React + xyflow      |                 |      /complete      |
| TanStack Query      |                 | CRUD /api/learnings |
+---------------------+                 +---------------------+
                                                  |
                                                  v
                                        +---------------------+
                                        |   os CLI (spawn)    |
                                        |   --json mode       |
                                        +---------------------+
```

---

## Package Structure

```
overseer/
├── overseer/                    # Existing Rust CLI
│   └── src/commands/ui.rs       # NEW: os ui command
│
├── ui/                          # NEW: UI packages
│   ├── server/                  # Hono API server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts         # Entry, serve static + API
│   │       ├── routes/
│   │       │   ├── tasks.ts
│   │       │   └── learnings.ts
│   │       ├── cli.ts           # Spawn os --json
│   │       └── types.ts         # Export AppType
│   │
│   ├── web/                     # Astro frontend
│   │   ├── package.json
│   │   ├── astro.config.mjs
│   │   ├── tailwind.config.js
│   │   └── src/
│   │       ├── layouts/
│   │       ├── pages/
│   │       ├── components/
│   │       ├── lib/
│   │       └── styles/
│   │
│   └── shared/                  # Shared types
│       ├── package.json
│       └── src/
│           └── types.ts
│
├── package.json                 # Root workspace
└── pnpm-workspace.yaml          # Add ui/*
```

---

## API Routes

### Tasks

```
GET    /api/tasks              # List all (supports ?ready=true, ?completed=false, ?parentId=X)
GET    /api/tasks/:id          # Get with context chain + learnings
PUT    /api/tasks/:id          # Update description, context, priority
DELETE /api/tasks/:id          # Delete task
POST   /api/tasks/:id/complete # Complete task (triggers VCS)
```

### Learnings

```
GET    /api/tasks/:id/learnings     # List learnings for task
POST   /api/tasks/:id/learnings     # Add learning
PUT    /api/learnings/:id           # Update learning
DELETE /api/learnings/:id           # Delete learning
```

### Meta

```
GET    /api/health             # Health check
```

---

## API Types

```typescript
// === Shared Types (ui/shared/types.ts) ===

interface Task {
  id: string                    // "task_01ABC..."
  parentId: string | null
  description: string
  context: TaskContext
  learnings: InheritedLearnings
  result: string | null
  priority: number              // 1-5, lower = higher
  completed: boolean
  completedAt: string | null    // ISO 8601
  startedAt: string | null
  createdAt: string
  updatedAt: string
  commitSha: string | null
  bookmark: string | null
  startCommit: string | null
  depth: number                 // 0=milestone, 1=task, 2=subtask
  blockedBy: string[]           // Task IDs
  blocks: string[]              // Task IDs
}

interface TaskContext {
  own: string
  parent: string | null         // Only for depth 2
  milestone: string | null      // For depth 1,2
}

interface InheritedLearnings {
  milestone: Learning[]
  parent: Learning[]
}

interface Learning {
  id: string                    // "lrn_01ABC..."
  taskId: string
  content: string
  sourceTaskId: string | null
  createdAt: string
}

// === Request/Response Types ===

// GET /api/tasks?ready=bool&completed=bool&parentId=string
type ListTasksResponse = Task[]

// GET /api/tasks/:id
type GetTaskResponse = Task

// PUT /api/tasks/:id
interface UpdateTaskRequest {
  description?: string
  context?: string
  priority?: number
}
type UpdateTaskResponse = Task

// DELETE /api/tasks/:id
type DeleteTaskResponse = { deleted: true }

// POST /api/tasks/:id/complete
interface CompleteTaskRequest {
  result?: string
}
type CompleteTaskResponse = Task

// POST /api/tasks/:id/learnings
interface CreateLearningRequest {
  content: string
}
type CreateLearningResponse = Learning

// PUT /api/learnings/:id
interface UpdateLearningRequest {
  content: string
}
type UpdateLearningResponse = Learning

// DELETE /api/learnings/:id
type DeleteLearningResponse = { deleted: true }
```

---

## Deliverables

### D1: CLI `os ui` Command

**Effort:** M  
**Files:** `overseer/src/commands/ui.rs`, `overseer/src/main.rs`

**Behavior:**
```bash
os ui              # Start server on :6969, open browser
os ui --no-open    # Start server only
os ui --port 8080  # Custom port
```

**Implementation:**
1. Spawn Hono server (Node.js) serving `ui/web/dist/` and API routes
2. Open browser via `open` crate
3. Block until Ctrl+C

**Acceptance:**
- [ ] `os ui` opens browser to `http://localhost:6969`
- [ ] Server serves static files and API routes
- [ ] Graceful shutdown on SIGINT

---

### D2: Hono API Server

**Effort:** M  
**Files:** `ui/server/`

**Implementation:**
- Each route spawns `os --json <command>` and returns parsed JSON
- Type-safe with Zod validators
- Export `AppType` for client generation

**Acceptance:**
- [ ] All routes return proper JSON
- [ ] Errors return `{ error: string }` with appropriate status codes
- [ ] `hc<AppType>()` client compiles with full type inference

---

### D3: Astro Frontend Shell

**Effort:** M  
**Files:** `ui/web/`

**Structure:**
```
ui/web/src/
├── layouts/
│   └── Layout.astro       # Dark theme, typography
├── pages/
│   └── index.astro        # Main app shell
├── components/
│   ├── TaskList.tsx       # Sidebar list
│   ├── TaskGraph.tsx      # xyflow graph
│   ├── TaskDetail.tsx     # Detail panel
│   └── ...
├── lib/
│   ├── api.ts             # hc<AppType> client
│   └── queries.ts         # TanStack Query hooks
└── styles/
    └── global.css         # Tailwind + theme
```

**Acceptance:**
- [ ] Builds to static files
- [ ] Dark theme matching inspiration images
- [ ] Responsive (but desktop-first)

---

### D4: Task List View

**Effort:** M  
**Component:** `TaskList.tsx`

**Features:**
- Sidebar showing all tasks grouped by milestone
- Status indicators (completed, in-progress, blocked)
- Priority badges
- Click to select -> shows in detail panel
- Filter: completed/active/blocked/ready

**Acceptance:**
- [ ] Shows all tasks hierarchically
- [ ] Clicking task updates detail panel
- [ ] Filters work correctly
- [ ] Blocked tasks visually distinct

---

### D5: Dependency Graph View

**Effort:** L  
**Component:** `TaskGraph.tsx`

**Features:**
- Full-screen graph with pan/zoom
- Nodes = tasks (custom component with title, status, priority)
- Edges = parent->child (solid) + blockedBy (dashed orange)
- Dagre auto-layout (top-down for hierarchy)
- Click node -> select in sidebar + detail panel
- Minimap for navigation

**Node Design:**
```
+-----------------------------+
| #75  [checkmark] Completed  |  <- status badge
+-----------------------------+
| Create SagaRunner base      |  <- description (truncated)
| class and saga schemas      |
+-----------------------------+
| P3  |  2 children           |  <- priority + child count
+-----------------------------+
```

**Acceptance:**
- [ ] Graph renders all tasks with correct edges
- [ ] Parent->child edges solid, blockedBy edges dashed
- [ ] Auto-layout produces readable hierarchy
- [ ] Click node selects it
- [ ] Minimap shows overview

---

### D6: Task Detail Panel

**Effort:** M  
**Component:** `TaskDetail.tsx`

**Features:**
- Shows selected task full details
- Editable fields: description, context, priority
- Read-only: id, parent, depth, blockedBy, blocks, timestamps
- Learnings list with add/edit/delete
- Complete button (with confirmation)
- Delete button (with confirmation)

**Acceptance:**
- [ ] All task fields displayed
- [ ] Edit saves via API
- [ ] Complete triggers VCS operation
- [ ] Delete removes task
- [ ] Learnings CRUD works

---

### D7: Visual Theme

**Effort:** M  
**Files:** `ui/web/src/styles/`, tailwind config

**Aesthetic:**
- **Background:** Deep charcoal (`#0a0a0a` - `#1a1a1a`)
- **Surface:** Slightly lighter (`#1f1f1f` - `#2a2a2a`)
- **Text:** Warm white (`#e5e5e5`), muted (`#737373`)
- **Accent:** Orange (`#f97316`) for CTAs, active states
- **Success:** Muted green for completed
- **Error:** Muted red for blocked/failed
- **Typography:**
  - Display: JetBrains Mono or similar monospace
  - Body: System sans or Inter
- **Borders:** Subtle (`#333333`)
- **Shadows:** Minimal, dark

**Acceptance:**
- [ ] Matches inspiration mood board
- [ ] No purple gradients, no generic AI look
- [ ] Consistent spacing scale
- [ ] All components themed

---

## Dependency Order

```
D1 (CLI) -----------------------------------------+
                                                  |
D2 (API) ------+----------------------------------+--> Integration
               |                                  |
D3 (Shell) ----+--> D4 (List) -----+              |
               |                   |              |
               |    D5 (Graph) ----+--> D6 (Panel)|
               |                   |              |
               +--> D7 (Theme) ----+              |
                                                  |
                         All <--------------------+
```

**Critical path:** D2 (API) -> D3 (Shell) -> D5 (Graph) -> Integration

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| xyflow + dagre layout issues with deep hierarchies | Medium | Medium | Test with 50+ tasks early; fallback to manual positioning |
| CLI spawn latency feels slow | Low | Medium | Add loading states; consider caching |
| Theme inconsistency across components | Low | Low | Design tokens in Tailwind config; review pass at end |

---

## Visual References

See `docs/inspiration/` for mood board:

| Image | Reference |
|-------|-----------|
| 01-amp-task-ui.png | Task list sidebar, dependency graph, detail panel layout |
| 02-cloudflare-workflows.png | Node-based workflow diagram, step history |
| 03-10-aesthetic-*.png | Industrial brutalism, monospace typography, orange accent, data-dense displays |

---

## Discovery Notes

### Hono RPC Client

Hono provides type-safe client generation via `hc<AppType>()`:
- No codegen step, pure TypeScript inference
- Export `type AppType = typeof app` from server
- Client gets full autocomplete for routes, params, responses
- Use `InferResponseType` / `InferRequestType` for extracting types

### TanStack Query vs TanStack DB

**Decision:** Use TanStack Query (not TanStack DB)

- TanStack DB is beta, overkill for simple REST polling
- TanStack Query v5 is stable, well-documented
- Simple `refetchInterval: 5000` for polling
- Can add optimistic updates later if needed

### React Flow (@xyflow/react)

**Decision:** Use @xyflow/react v12 (not beautiful-mermaid)

- beautiful-mermaid renders static SVG, no click handlers
- React Flow has built-in node click/hover/drag
- Custom node components for task cards
- Dagre integration well-documented
- Used by Supabase, Turborepo, Microsoft AutoGen

### Astro + Hono Architecture

**Decision:** Separate servers during dev, combined for production

- Dev: Astro on :4321, Hono on :6969, Vite proxy
- Prod: Hono serves Astro's `dist/` as static files
- Astro `output: 'static'` - no SSR needed
