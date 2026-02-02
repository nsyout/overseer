# ui/ - Overseer Task Viewer

Local webapp for inspecting Overseer task store. Hono API + Vite SPA + React + TanStack Query + Tailwind v4.

## STRUCTURE

```
ui/
├── src/
│   ├── api/              # Hono API server
│   │   ├── app.ts        # Routes, AppType export
│   │   ├── index.ts      # serve() entry
│   │   ├── cli.ts        # CLI bridge (spawns `os --json`)
│   │   └── routes/       # API route handlers
│   │
│   ├── client/           # React SPA
│   │   ├── main.tsx      # React root, QueryClientProvider
│   │   ├── App.tsx       # 3-panel layout
│   │   ├── components/   # UI components
│   │   ├── lib/
│   │   │   ├── api.ts    # hc<AppType> client
│   │   │   └── queries.ts # TanStack Query hooks
│   │   └── styles/
│   │       └── global.css # Tailwind v4 + theme
│   │
│   └── types.ts          # Shared types (mirrors mcp/src/types.ts)
│
├── scripts/
│   └── test-ui.sh        # agent-browser test script
│
├── docs/
│   └── UI-TESTING.md     # Testing documentation
│
├── vite.config.ts        # Vite config with /api/* proxy
├── index.html            # SPA entry
└── package.json
```

## COMMANDS

```bash
npm run dev              # Start Hono API + Vite HMR
npm run dev:api          # Start Hono API only
npm run dev:vite         # Start Vite only
npm run build            # Build for production
npm run typecheck        # Type check

# Testing (see docs/UI-TESTING.md)
npm run test:ui          # Full test suite
npm run test:ui:snapshot # Show UI structure
npm run test:ui:watch    # Continuous testing
```

## KEY FILES

| Task | File |
|------|------|
| Add API route | `src/api/routes/tasks.ts` |
| Add React component | `src/client/components/` |
| Add query hook | `src/client/lib/queries.ts` |
| Modify theme | `src/client/styles/global.css` |
| CLI bridge | `src/api/cli.ts` |

## LARGE COMPONENTS

| Component | Lines | Purpose |
|-----------|-------|---------|
| `TaskGraph.tsx` | 1021 | React Flow graph with hierarchy visualization |
| `TaskDetail.tsx` | 611 | Detail panel with context/learnings display |
| `KanbanView.tsx` | 549 | Kanban board view |
| `TaskList.tsx` | 545 | Filterable task list |

## THEME

Tailwind v4 CSS-first config in `global.css`. Industrial aesthetic, dark mode only, OKLCH colors.

### Core Palette (OKLCH)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-primary` | `oklch(0.13 0 0)` | Main background |
| `--color-bg-secondary` | `oklch(0.16 0 0)` | Panel backgrounds |
| `--color-surface-primary` | `oklch(0.18 0 0)` | Cards, inputs |
| `--color-surface-secondary` | `oklch(0.22 0 0)` | Elevated surfaces |
| `--color-text-primary` | `oklch(0.9 0 0)` | Main text |
| `--color-text-muted` | `oklch(0.55 0 0)` | Secondary text |
| `--color-text-dim` | `oklch(0.4 0 0)` | Tertiary text |
| `--color-accent` | `oklch(0.7 0.18 45)` | Orange accent |
| `--color-accent-muted` | `oklch(0.5 0.12 45)` | Muted accent |
| `--color-accent-subtle` | `oklch(0.3 0.08 45)` | Subtle accent bg |
| `--color-border` | `oklch(0.28 0 0)` | Borders |
| `--color-border-focus` | `oklch(0.7 0.18 45)` | Focus ring (accent) |

### Status Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--color-status-pending` | `oklch(0.55 0 0)` | Neutral gray |
| `--color-status-active` | `oklch(0.7 0.18 45)` | Orange (pulsing) |
| `--color-status-blocked` | `oklch(0.65 0.2 25)` | Red-orange |
| `--color-status-done` | `oklch(0.65 0.12 145)` | Teal-green |

### Typography (fully monospace)
| Token | Value |
|-------|-------|
| `--font-display` | JetBrains Mono, SF Mono, monospace |
| `--font-body` | JetBrains Mono, SF Mono, monospace |
| `--font-mono` | JetBrains Mono, SF Mono, monospace |

## ENVIRONMENT

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `6969` | Hono API port |
| `OVERSEER_CLI_PATH` | `os` | CLI binary path |
| `OVERSEER_CLI_CWD` | `process.cwd()` | CLI working directory |

## DOCS

| Document | Purpose |
|----------|---------|
| `docs/UI-TESTING.md` | agent-browser testing guide |
| `../docs/specs/task-viewer.md` | Feature spec |

## PATTERNS (from learnings)

### Keyboard Shortcuts
- `useKeyboardShortcuts` uses ref pattern: store `make` function in `useRef`, update `ref.current` each render
- Guard with `e.isComposing` to prevent shortcuts during IME composition (CJK input)
- `e.target` can be null at runtime - use `instanceof HTMLElement` check
- SELECT elements are editable targets (exclude alongside INPUT/TEXTAREA)

### Zustand
- Selectors should be granular (one per state slice) to prevent re-renders
- Store exports `useViewMode`/`useSelectedTaskId`/etc - use these, not raw `useStore`

### ARIA/Accessibility
- Roving tabindex: focused item gets `tabIndex=0`, others `-1`. On j/k, call `element.focus({ preventScroll: true })`
- ARIA listbox requires arrow-key nav OR roving tabindex - don't mix button `role=option`
- `role=listitem` must not override interactive semantics - wrap button in `div[role=listitem]`
- Decorative SVG icons need `aria-hidden="true"`
- `motion-reduce:transition-none` on all transitions for prefers-reduced-motion

### Tailwind
- Dynamic classes like `text-status-${var}` work by accident - use static lookup maps
- `transition-all` is overly broad - use `transition-[property]` for specific animations
- `tailwind-variants` slot values shouldn't concatenate conflicting classes

### React
- `useEffect` deps with state used only in guards defeat the guard's purpose - remove from deps
- O(n) `findIndex` in recursive tree = O(n^2) total - precompute `Map<id, index>` via `useMemo`
- ReactFlow `fitView()` works for offscreen nodes - don't guard with DOM existence check

## NOTES

- Types in `src/types.ts` must mirror `mcp/src/types.ts`
- CLI bridge spawns `os --json <command>` 
- Vite proxies `/api/*` to Hono in dev mode
- Production: Hono serves `dist/` static files
