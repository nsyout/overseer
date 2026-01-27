# OS SOURCE

Rust CLI source. All business logic - MCP wrapper just spawns and parses JSON.

## MODULES

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `commands/` | CLI subcommand handlers | task.rs, learning.rs, vcs.rs, data.rs |
| `core/` | Business logic layer | task_service.rs, workflow_service.rs, context.rs |
| `db/` | SQLite persistence | schema.rs, task_repo.rs, learning_repo.rs |
| `vcs/` | Native VCS backends | jj.rs (primary), git.rs (fallback), detection.rs |

## ENTRY POINTS

| File | Purpose |
|------|---------|
| `main.rs` | clap CLI, JSON/human output, command dispatch |
| `lib.rs` | Re-exports for integration tests |

## KEY FILES

| File | Lines | Role |
|------|-------|------|
| `main.rs` | 491 | CLI entry, output formatting |
| `core/task_service.rs` | ~300 | Task CRUD, validation, cycles |
| `core/workflow_service.rs` | ~150 | Start/complete with VCS |
| `db/task_repo.rs` | ~300 | SQL queries |
| `vcs/jj.rs` | ~400 | jj-lib backend |
| `error.rs` | ~80 | OsError enum (thiserror) |
| `types.rs` | ~150 | Domain types, serde |
| `id.rs` | ~100 | TaskId, LearningId (ULID) |

## DATA FLOW

```
main.rs (clap parse)
    │
    ├── commands/*.rs (dispatch)
    │       │
    │       ├── core/task_service.rs (validation, cycles)
    │       │       │
    │       │       └── db/task_repo.rs (SQL)
    │       │
    │       └── core/workflow_service.rs (VCS integration)
    │               │
    │               └── vcs/*.rs (jj-lib or gix)
    │
    └── print_human() or JSON output
```

## CONVENTIONS

- `Result<T>` = `Result<T, OsError>` (aliased in error.rs)
- Prefixed IDs: `task_*`, `lrn_*` with CHECK constraints
- `serde(rename_all = "camelCase")` for JSON
- `pollster::block_on` for jj-lib async at boundaries
- Clone commands before handle() (clap ownership)

## TESTS

| Location | Type | Count |
|----------|------|-------|
| `tests/*.rs` | Integration | 3 files |
| `src/**/*.rs` | Unit (inline) | 89 #[test] fns |
| `testutil.rs` | Helpers | JjTestRepo, GitTestRepo |
