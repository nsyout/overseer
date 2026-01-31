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

## THEME

Tailwind v4 CSS-first config in `global.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-primary` | `#0a0a0a` | Main background |
| `--color-bg-secondary` | `#1a1a1a` | Panel backgrounds |
| `--color-surface-primary` | `#1f1f1f` | Cards, inputs |
| `--color-text-primary` | `#e5e5e5` | Main text |
| `--color-text-muted` | `#737373` | Secondary text |
| `--color-accent` | `#f97316` | Orange accent |
| `--color-border` | `#333333` | Borders |

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

## NOTES

- Types in `src/types.ts` must mirror `mcp/src/types.ts`
- CLI bridge spawns `os --json <command>` 
- Vite proxies `/api/*` to Hono in dev mode
- Production: Hono serves `dist/` static files
