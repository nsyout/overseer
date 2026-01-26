# overseer: Design Plan

A codemode MCP server for agent task management, backed by SQLite with native VCS integration (jj-lib + gix). JJ-first.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   overseer (Node MCP)              │
│  - Single "execute" tool                                    │
│  - VM sandbox with tasks/vcs APIs                           │
│  - Calls CLI via spawn, parses JSON                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        os (Rust CLI)                     │
│  - All business logic                                       │
│  - SQLite storage                                           │
│  - Native VCS: jj-lib (jj) + gix (git)                      │
│  - JSON output mode for MCP                                 │
└─────────────────────────────────────────────────────────────┘
```

## Why This Architecture

| Decision | Rationale |
|----------|-----------|
| Rust CLI as core | Testable, reusable, performant |
| Node MCP wrapper | MCP SDK is JS, codemode sandbox is V8 |
| SQLite not JSON | Queries, transactions, FTS, concurrent access |
| gix (not git2) | Pure Rust, no C deps, actively developed |
| jj-lib (not shell) | Native performance, no spawn overhead |
| JJ-first | Primary VCS, git as fallback for non-jj repos |

---

## Rust CLI: os

### File Structure

```
os/
├── Cargo.toml
├── src/
│   ├── main.rs              # CLI entry (clap)
│   ├── lib.rs               # Library exports
│   │
│   ├── commands/            # CLI command handlers
│   │   ├── mod.rs
│   │   ├── task.rs          # task create/update/complete/list/get
│   │   ├── learning.rs      # learning add/list
│   │   └── vcs.rs           # vcs detect/status/commit
│   │
│   ├── core/                # Business logic
│   │   ├── mod.rs
│   │   ├── task_service.rs  # Task operations + invariants
│   │   ├── learning_service.rs
│   │   └── context.rs       # Progressive context assembly
│   │
│   ├── db/                  # SQLite layer
│   │   ├── mod.rs
│   │   ├── schema.rs        # Table creation, migrations
│   │   ├── task_repo.rs     # Task CRUD
│   │   └── learning_repo.rs
│   │
│   ├── vcs/                 # VCS abstraction
│   │   ├── mod.rs           # VcsBackend trait, get_backend()
│   │   ├── backend.rs       # Trait definition, VcsError
│   │   ├── detection.rs     # Walk up for .jj/.git
│   │   ├── jj.rs            # JjBackend (jj-lib) [PRIMARY]
│   │   └── git.rs           # GixBackend (gix)
│   │
│   ├── types.rs             # Core types
│   └── error.rs             # Error types (thiserror)
```

### Cargo.toml

```toml
[package]
name = "os"
version = "0.1.0"
edition = "2021"

[dependencies]
# CLI
clap = { version = "4.5", features = ["derive"] }

# Storage
rusqlite = { version = "0.38", features = ["bundled"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Utilities
thiserror = "2.0"
chrono = { version = "0.4", features = ["serde"] }
ulid = "1.2"

# JJ backend (jj-lib) [PRIMARY] - pin exact version due to API instability
jj-lib = "=0.37"
pollster = "0.4"

# Git backend (gix) - fallback for non-jj repos (Phase 4)
# gix = { version = "0.72", default-features = false, features = [
#     "index",
#     "worktree-mutation",
#     "status",
#     "revision",
#     "dirwalk",
# ] }

# [profile.dev.package.gix]
# opt-level = 1  # Faster runtime for large repos

[profile.dev.package.jj-lib]
opt-level = 1
```

### CLI Commands

```bash
# Task operations
os task create -d "Description" --context "..." [--parent ID] [--priority N] [--blocked-by ID,ID]
os task update ID [-d "..."] [--context "..."] [--priority N] [--parent ID]
os task get ID                    # Full task with progressive context + learnings
os task list [--parent ID] [--ready] [--completed]
os task start ID
os task complete ID [--result "..."]
os task reopen ID
os task delete ID
os task next-ready [--milestone ID]
os task tree [ID]
os task search "query"

# Blocking
os task block ID --by BLOCKER_ID
os task unblock ID --by BLOCKER_ID

# Learnings
os learning add TASK_ID "content" [--source TASK_ID]
os learning list TASK_ID

# VCS
os vcs detect
os vcs status
os vcs log [--limit N]
os vcs diff [BASE]
os vcs commit -m "message"

# Utilities
os init                           # Create .overseer/ and DB
os export                         # Dump all tasks as JSON
os import FILE                    # Import from JSON

# Global flags
--json                               # Output as JSON (for MCP)
--db PATH                            # Override DB path
```

---

## SQLite Schema

```sql
-- .overseer/tasks.db

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,              -- ULID
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    result TEXT,
    priority INTEGER NOT NULL DEFAULT 3,  -- 1-5 (1=highest)
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    commit_sha TEXT,                  -- Auto-populated on complete if VCS available
    started_at TEXT
);

CREATE TABLE learnings (
    id TEXT PRIMARY KEY,              -- ULID
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source_task_id TEXT,              -- Which completion triggered this
    created_at TEXT NOT NULL
);

CREATE TABLE task_blockers (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    blocker_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, blocker_id)
);

CREATE TABLE task_metadata (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    data TEXT NOT NULL                -- JSON blob
);

-- Indexes
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_tasks_ready ON tasks(parent_id, completed, priority, created_at)
    WHERE completed = 0;
CREATE INDEX idx_learnings_task ON learnings(task_id);
CREATE INDEX idx_blockers_blocker ON task_blockers(blocker_id);

PRAGMA user_version = 1;
PRAGMA journal_mode = WAL;
```

---

## Task Hierarchy

```
Milestone (depth=0, parent_id=NULL)
  └── Task (depth=1)
        └── Subtask (depth=2, max - no children allowed)
```

Depth enforced by TaskService, not schema.

---

## Progressive Context Disclosure

When fetching a subtask, response includes ancestor context + learnings:

```json
{
    "id": "01JDEF...",
    "description": "Add token refresh logic",
    "depth": 2,
    "context": {
        "own": "Handle 7-day expiry, rotate on use",
        "parent": "JWT service with RS256 signing, 15-min access tokens",
        "milestone": "Full auth system with OAuth support"
    },
    "learnings": {
        "milestone": [
            { "id": "...", "content": "Use jose library not jsonwebtoken", "createdAt": "..." }
        ],
        "parent": [
            { "id": "...", "content": "Hash refresh tokens before storage", "createdAt": "..." }
        ]
    },
    "priority": 2,
    "completed": false,
    "blockedBy": [],
    "blocks": []
}
```

---

## VCS Backend Trait

```rust
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum VcsError {
    #[error("not a repository")]
    NotARepository,
    #[error("invalid reference: {0}")]
    InvalidRef(String),
    #[error("no uncommitted changes")]
    NothingToCommit,
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CommitInfo {
    pub id: String,
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VcsType {
    Jj,
    Git,
    None,
}

pub trait VcsBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn vcs_type(&self) -> VcsType;
    fn status(&self) -> Result<String, VcsError>;
    fn log(&self, limit: usize) -> Result<Vec<CommitInfo>, VcsError>;
    fn diff(&self, base: Option<&str>) -> Result<String, VcsError>;
    fn commit(&self, message: &str) -> Result<CommitInfo, VcsError>;
    fn get_head_id(&self) -> Result<String, VcsError>;
    fn has_uncommitted_changes(&self) -> Result<bool, VcsError>;
    fn get_current_branch(&self) -> Result<Option<String>, VcsError>;
}
```

### Detection

```rust
pub fn detect_vcs_type(path: &Path) -> VcsType {
    let mut current = path;
    loop {
        // jj takes priority (colocated repos have both)
        if current.join(".jj").is_dir() {
            return VcsType::Jj;
        }
        if current.join(".git").exists() {
            return VcsType::Git;
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => return VcsType::None,
        }
    }
}

pub fn get_backend(path: &Path) -> Result<Box<dyn VcsBackend>, VcsError> {
    match detect_vcs_type(path) {
        VcsType::Jj => Ok(Box::new(JjBackend::open(path)?)),
        VcsType::Git => Ok(Box::new(GixBackend::open(path)?)),
        VcsType::None => Err(VcsError::NotARepository),
    }
}
```

### Commit Semantics

Unified `commit()` that works for both:

| VCS | Behavior |
|-----|----------|
| jj | `jj describe -m "..." && jj new` (if dirty); else `jj describe` on @ |
| git | `git add -A && git commit -m "..."` |

---

## Invariants (enforced by TaskService)

1. **No cycles in parent chain**
2. **Max depth = 3** (subtasks can't have children)
3. **No cycles in blocker chain** (DFS cycle detection before adding blockers)
4. **Can't complete with pending children**
5. **Blockers must exist**
6. **commit_sha auto-populated on complete** if VCS available
7. **Deleting parent deletes all descendants** (CASCADE - no orphans)

---

## Node MCP Layer

### Structure

```
overseer/
├── package.json
├── src/
│   ├── index.ts          # Entry, stdio transport
│   ├── server.ts         # MCP server, execute tool registration
│   ├── executor.ts       # VM sandbox, calls CLI
│   └── truncate.ts       # Response size limiting
```

### Executor

```typescript
import { spawn } from 'child_process';

async function callCli(args: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const proc = spawn('os', [...args, '--json'], { cwd: process.cwd() });
        
        const timeout = setTimeout(() => {
            proc.kill();
            reject(new Error('CLI timeout (30s)'));
        }, 30_000);
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        
        proc.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(new Error(stderr || `Exit code ${code}`));
            } else {
                try {
                    resolve(JSON.parse(stdout));
                } catch {
                    reject(new Error(`Invalid JSON: ${stdout}`));
                }
            }
        });
    });
}

// Exposed to sandbox
export const tasks = {
    list: (filter?: TaskFilter) => callCli(['task', 'list', ...filterToArgs(filter)]),
    get: (id: string) => callCli(['task', 'get', id]),
    create: (input: CreateInput) => callCli(['task', 'create', ...inputToArgs(input)]),
    // ... etc
};

export const vcs = {
    detect: () => callCli(['vcs', 'detect']),
    status: () => callCli(['vcs', 'status']),
    commit: (msg: string) => callCli(['vcs', 'commit', '-m', msg]),
    // ... etc
};
```

### Tool Description

Single `execute` tool with types + examples embedded:

```typescript
const TYPES = `
interface Task {
    id: string;
    parentId: string | null;
    description: string;
    context: { own: string; parent?: string; milestone?: string };
    learnings: { milestone: Learning[]; parent: Learning[] };
    priority: 1 | 2 | 3 | 4 | 5;
    completed: boolean;
    depth: 0 | 1 | 2;
    blockedBy: string[];
    blocks: string[];
}

declare const tasks: {
    list(filter?: { parentId?: string; ready?: boolean; completed?: boolean }): Promise<Task[]>;
    get(id: string): Promise<Task>;
    create(input: { description: string; context?: string; parentId?: string; priority?: number }): Promise<Task>;
    complete(id: string, result?: string): Promise<Task>;
    nextReady(milestoneId?: string): Promise<Task | null>;
    // ...
};

declare const vcs: {
    detect(): Promise<{ type: 'jj' | 'git' | 'none'; root: string }>;
    commit(message: string): Promise<{ id: string; message: string }>;
    // ...
};
`;
```

---

## Implementation Phases

### Phase 1: Core CLI (M)

- [ ] Scaffold Rust project with clap
- [ ] SQLite schema + migrations
- [ ] Task CRUD (create, get, list, update, delete)
- [ ] Task hierarchy enforcement (depth limit)
- [ ] Blocker relationships + cycle detection
- [ ] JSON output mode

### Phase 2: Progressive Context (S)

- [ ] Context chain assembly in `task get`
- [ ] Learnings table + CRUD
- [ ] Inherited learnings in `task get`

### Phase 3: JJ Backend - jj-lib (L) [PRIORITY]

- [ ] VcsBackend trait
- [ ] JjBackend implementation (adapt from lumen)
- [ ] Detection logic
- [ ] Handle async with pollster
- [ ] status, log, diff, commit operations
- [ ] Auto-populate commit_sha on complete
- [ ] Colocated repo handling

### Phase 4: Git Backend - gix (M)

- [ ] GixBackend implementation
- [ ] status, log, diff, commit operations

### Phase 5: Node MCP (S)

- [ ] MCP server setup
- [ ] VM sandbox executor
- [ ] CLI bridge (spawn + JSON parse)
- [ ] Tool registration with types

### Phase 6: Testing (M)

- [ ] Unit tests for TaskService
- [ ] Integration tests with temp jj repos
- [ ] Integration tests with temp git repos
- [ ] MCP integration tests

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| jj-lib API churn | Pin exact version (`=0.28`), abstraction layer |
| gix missing features | Check docs, use appropriate feature flags |
| Build times (2-3 min) | Profile tuning, incremental builds |
| Large repo performance | gix/jj-lib object caching |

---

## Testing Strategy

Use temp repos, not mocks:

```rust
#[test]
fn test_jj_backend() {
    let tmp = tempfile::TempDir::new().unwrap();
    // jj_lib::workspace::Workspace::init(...)
}

#[test]
fn test_git_commit() {
    let tmp = tempfile::TempDir::new().unwrap();
    let repo = gix::init(tmp.path()).unwrap();
    // ... test
}
```

---

## Design Decisions

1. **Task ID format** - ULID (sortable, readable, no coordination)
2. **Parent deletion** - CASCADE (deletes descendants)
3. **jj-lib version** - Pin `=0.37` (unstable API)
4. **Commit signing** - Not supported in v1
5. **Detached HEAD (git)** - Return current commit SHA; commit still works
6. **Timestamp format** - ISO 8601 / RFC 3339 (via chrono)

---

## Effort Estimate

| Component | Effort |
|-----------|--------|
| CLI skeleton + clap | S |
| SQLite schema + repos | M |
| TaskService (CRUD, context) | M |
| LearningService | S |
| JjBackend (jj-lib) | L |
| GixBackend (gix) | M |
| Node MCP wrapper | S |
| Integration tests | M |
| **Total** | **XL (3-4 days)** |
