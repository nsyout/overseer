# OVERSEER PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-27  
**Commit:** adcadb4  
**Branch:** main

**Overseer** (`os`) - Codemode MCP server for agent task management. SQLite-backed, native VCS (jj-lib + gix). JJ-first.

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                     Overseer (Node MCP)                     │
│  - Single "execute" tool (codemode pattern)                 │
│  - VM sandbox with tasks/learnings APIs                     │
│  - Spawns CLI, parses JSON                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      os (Rust CLI)                          │
│  - All business logic                                       │
│  - SQLite storage                                           │
│  - Native VCS: jj-lib (jj) + gix (git)                      │
│  - JSON output mode for MCP                                 │
└─────────────────────────────────────────────────────────────┘
```

## STRUCTURE

```
overseer/
├── overseer/                # Rust CLI package (binary: os)
│   └── src/
│       ├── main.rs          # Entry (clap CLI)
│       ├── commands/        # Subcommand handlers
│       ├── core/            # TaskService, WorkflowService, context
│       ├── db/              # SQLite repos
│       └── vcs/             # jj-lib + gix backends
│
├── mcp/                     # Node MCP wrapper
│   └── src/
│       ├── index.ts         # Entry (stdio transport)
│       ├── server.ts        # execute tool registration
│       ├── executor.ts      # VM sandbox, CLI bridge
│       └── api/             # tasks/learnings APIs
│
├── npm/                     # Publishing (platform-specific binaries)
│   ├── overseer/            # Main package (routing wrapper)
│   └── scripts/             # Platform package generation
│
├── skills/                  # Agent skills (skills.sh compatible)
│   ├── overseer/            # Task management skill
│   └── overseer-plan/       # Plan-to-task conversion skill
│
└── docs/                    # Reference documentation
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add CLI command | `overseer/src/commands/` | Add in mod.rs, wire in main.rs |
| Add MCP API | `mcp/src/api/` | Export in api/index.ts |
| Task CRUD | `overseer/src/db/task_repo.rs` | SQL layer |
| Task business logic | `overseer/src/core/task_service.rs` | Validation, hierarchy |
| Task workflow (start/complete) | `overseer/src/core/workflow_service.rs` | VCS integration |
| VCS operations | `overseer/src/vcs/` | jj.rs (primary), git.rs (fallback) |
| Error types | `overseer/src/error.rs` | OsError enum |
| Types/IDs | `overseer/src/types.rs`, `overseer/src/id.rs` | Domain types, ULID |

## KEY DECISIONS

| Decision | Choice | Why |
|----------|--------|-----|
| CLI binary | `os` | Short, memorable |
| Storage | SQLite | Concurrent access, queries |
| VCS primary | jj-lib | Native perf, no spawn |
| VCS fallback | gix | Pure Rust, no C deps |
| IDs | ULID | Sortable, coordination-free |
| Task hierarchy | 3 levels max | Epic → Task → Subtask |
| Error pattern | `thiserror` | Ergonomic error handling |

## CONVENTIONS

- **Result everywhere**: All fallible ops return `Result<T, E>`
- **TaggedError (TS)**: Errors use `_tag` discriminator
- **No `any`**: Strict TypeScript
- **No `!`**: Non-null assertions forbidden
- **No `as Type`**: Type assertions forbidden
- **jj-first**: ALWAYS check for `.jj/` before VCS commands

## ANTI-PATTERNS

- Never guess VCS type - detect via `overseer/src/vcs/detection.rs`
- Never skip cycle detection - DFS in `task_service.rs`
- Never bypass CASCADE delete invariant
- Never use depth limit for cycle detection (use DFS)

## COMMANDS

```bash
# Rust CLI
cd overseer && cargo build --release    # Build CLI
cd overseer && cargo test               # Run tests

# Node MCP
cd mcp && npm install             # Install deps
cd mcp && npm run build           # Compile TS
cd mcp && npm test                # Run tests
```

## DESIGN INVARIANTS

1. Cycle detection via DFS (not depth limit)
2. CASCADE delete on tasks removes children + learnings
3. CLI spawn timeout: 30s in Node executor
4. Timestamps: ISO 8601 / RFC 3339 (chrono)
5. "Milestone" = depth-0 task (no parent)

## CODEMODE PATTERN

Agents write JS → server executes → only results return.

- Pattern source: [opensrc-mcp](https://github.com/dmmulroy/opensrc-mcp)
- Why: LLMs handle TypeScript APIs better than raw tool calls
- Key: `executor.ts` (VM sandbox), `server.ts` (tool registration)

## DOCS

| Document | Purpose |
|----------|---------|
| `docs/ARCHITECTURE.md` | System design |
| `docs/CLI.md` | CLI command reference |
| `docs/MCP.md` | MCP tool/API reference |
| `docs/TASKS.md` | Task system design |
| `docs/task-orchestrator-plan.md` | Original design spec |
| `docs/codemode-*.md` | Codemode pattern research |
