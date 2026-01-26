# CLI COMMAND HANDLERS

**Command handlers for `os` CLI - wire clap to core services.**

## FILES

| File | Purpose | Key Exports |
|------|---------|-------------|
| `task.rs` | Task CRUD, lifecycle, queries | `TaskCommand`, `TaskResult`, `handle()` |
| `learning.rs` | Learning CRUD for tasks | `LearningCommand`, `LearningResult`, `handle()` |
| `vcs.rs` | VCS operations (detect, status, log, diff, commit) | `VcsCommand`, `VcsResult`, `handle()` |
| `data.rs` | Import/export tasks + learnings (JSON) | `DataCommand`, `DataResult`, `handle()` |
| `mod.rs` | Re-exports all commands | Public API |

## PATTERNS

### Handler Signature

```rust
pub fn handle(conn: &Connection, cmd: FooCommand) -> Result<FooResult>
```

- **Input**: clap-parsed command enum (owned after clone in main.rs)
- **Output**: Domain result enum (converted to JSON in main.rs)
- **No I/O**: All formatting/printing in main.rs `print_human()`

### Command Cloning (main.rs:147-234)

**Why**: clap Commands borrow CLI state; handlers need owned values

```rust
fn clone_task_cmd(cmd: &TaskCommand) -> TaskCommand {
    match cmd {
        TaskCommand::Create(args) => TaskCommand::Create(CreateArgs {
            description: args.description.clone(),
            // ... explicit field clones
        }),
        // ... exhaustive match
    }
}
```

Pattern: Explicit field clones (no #[derive(Clone)] on Args structs)

### ID Parsing

```rust
fn parse_task_id(s: &str) -> std::result::Result<TaskId, String> {
    s.parse().map_err(|e| format!("{e}"))
}
```

Used in `#[arg(value_parser = parse_task_id)]` - validates prefix at CLI boundary

### Result Enums

```rust
pub enum TaskResult {
    One(Task),
    OneWithContext(TaskWithContext),
    Many(Vec<Task>),
    Deleted,
    Tree(TaskTree),
}
```

Each handler returns domain-specific enum (main.rs converts to JSON/human)

## CONVENTIONS

- **No business logic**: Handlers delegate to services (`TaskService`, repos)
- **Error propagation**: `?` operator throughout - errors bubble to main.rs
- **Validation in services**: Handlers trust service layer for invariants
- **VCS handlers stateless**: No DB conn (VCS is independent state)

## ERROR HANDLING

All handlers return `Result<T, OsError>`:
- Validation errors from services (e.g., cycle detection)
- DB errors from repos (e.g., not found)
- VCS errors (e.g., not a repo)

main.rs converts errors to JSON (`{"error": "..."}`) or human output
