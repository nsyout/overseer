# Overseer Technical Deep Dive

**Comprehensive Architecture Analysis**

---

## Executive Summary

Overseer is a **SQLite-backed task orchestration system** with native VCS integration (jj-lib + gix), exposed via a **codemode MCP server pattern**. The system comprises ~6,000 LOC split between a Rust CLI (business logic + storage) and Node.js MCP wrapper (agent interface).

**Key Innovation**: The codemode pattern allows AI agents to write JavaScript that executes in a sandboxed VM with high-level APIs, rather than making raw tool calls. This provides superior composability and type safety for LLM interactions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              MCP Server (Node.js)                       │
│  - Single "execute" tool (codemode pattern)             │
│  - VM sandbox exposing tasks/learnings/vcs APIs         │
│  - Spawns Rust CLI, parses JSON responses               │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼ spawn + --json
┌─────────────────────────────────────────────────────────┐
│              Rust CLI Binary (os)                       │
│  - All business logic + validation                      │
│  - SQLite storage with foreign keys                     │
│  - Native VCS: jj-lib (primary) + gix (fallback)        │
│  - Structured JSON output mode                          │
└─────────────────────────────────────────────────────────┘
```

### Design Philosophy

1. **Thin MCP Layer**: The Node.js server is a 1,500 LOC wrapper that provides agent interface
2. **Rich Business Logic**: All validation, cycles detection, and domain rules in Rust
3. **Type Safety**: Strong typing from Rust → TypeScript → Agent code
4. **VCS-First**: Native integration with version control, not bolted on
5. **Agent-Optimized**: Codemode pattern designed for LLM composability

---

## Directory Structure

### Rust CLI (`os/`)

```
os/
├── src/
│   ├── main.rs              # CLI entry (clap), JSON/human output
│   ├── lib.rs               # Module declarations
│   ├── id.rs                # ULID-based newtypes (TaskId, LearningId)
│   ├── types.rs             # Domain types (Task, CreateTaskInput, etc.)
│   ├── error.rs             # OsError enum (thiserror)
│   │
│   ├── commands/            # Command handlers (16 operations)
│   │   ├── mod.rs           # Command exports
│   │   ├── task.rs          # Task CRUD + state transitions
│   │   ├── learning.rs      # Learning CRUD
│   │   ├── vcs.rs           # VCS operations (detect, status, log, diff, commit)
│   │   └── data.rs          # Import/export (JSON serialization)
│   │
│   ├── core/                # Business logic layer
│   │   ├── mod.rs
│   │   ├── task_service.rs  # Validation, cycle detection, context assembly
│   │   └── context.rs       # Context chain + learning inheritance
│   │
│   ├── db/                  # Data access layer
│   │   ├── mod.rs
│   │   ├── schema.rs        # SQLite schema + migrations
│   │   ├── task_repo.rs     # Task CRUD (SQL queries)
│   │   └── learning_repo.rs # Learning CRUD
│   │
│   ├── vcs/                 # Version control integration
│   │   ├── mod.rs
│   │   ├── backend.rs       # VcsBackend trait
│   │   ├── detection.rs     # .jj/.git detection (jj prioritized)
│   │   ├── jj.rs            # jj-lib backend (native API)
│   │   └── git.rs           # gix backend (pure Rust)
│   │
│   └── testutil.rs          # Test helpers (JjTestRepo, GitTestRepo)
│
├── tests/                   # Integration tests
│   ├── task_service_test.rs
│   ├── learning_service_test.rs
│   └── git_integration_test.rs
│
└── Cargo.toml               # Dependencies (rusqlite, jj-lib, gix, clap, serde)
```

### Node MCP Server (`mcp/`)

```
mcp/
├── src/
│   ├── index.ts             # Entry point (stdio transport)
│   ├── server.ts            # MCP server registration + execute tool
│   ├── executor.ts          # VM sandbox (node:vm) with API context
│   ├── cli.ts               # CLI bridge (spawn os, parse JSON)
│   ├── types.ts             # TypeScript type definitions
│   │
│   └── api/                 # Agent-facing APIs
│       ├── index.ts         # API exports
│       ├── tasks.ts         # tasks.create/get/list/update/etc (16 ops)
│       ├── learnings.ts     # learnings.add/list/delete
│       └── vcs.ts           # vcs.detect/status/log/commit
│
├── tests/                   # Unit/integration tests
│   ├── server.test.ts
│   ├── executor.test.ts
│   └── integration.test.ts
│
└── package.json             # Dependencies (@modelcontextprotocol/sdk, node:vm)
```

---

## Core Type System

### Identity Types (`os/src/id.rs`)

Overseer uses **prefixed ULIDs** for type-safe, sortable identifiers:

```rust
// Newtype wrappers with validation
pub struct TaskId(Ulid);        // Prefix: "task_" (31 chars total)
pub struct LearningId(Ulid);    // Prefix: "lrn_"  (30 chars total)

// Example IDs:
// task_01ARZ3NDEKTSV4RRFFQ69G5FAV
// lrn_01ARZ3NDEKTSV4RRFFQ69G5FAV
```

**Properties**:
- **Sortable**: ULID timestamp prefix enables chronological ordering
- **Coordination-Free**: Generated without central authority
- **Type-Safe**: Rust newtypes prevent mixing TaskId/LearningId
- **Validated**: Prefix + length checked on parse

**Implementation Details**:
```rust
impl FromStr for TaskId {
    fn from_str(s: &str) -> Result<Self> {
        if !s.starts_with("task_") || s.len() != 31 {
            return Err(OsError::InvalidId);
        }
        let ulid = Ulid::from_string(&s[5..])?;
        Ok(TaskId(ulid))
    }
}

// ToSql/FromSql for rusqlite
// Display for user-facing output
// Serialize/Deserialize for JSON
```

### Domain Types (`os/src/types.rs`)

#### Task Type

```rust
pub struct Task {
    // Identity
    id: TaskId,
    parent_id: Option<TaskId>,        // 3-level hierarchy support
    
    // Description
    description: String,
    
    // Context (stored raw, computed on read)
    context: String,                   // Own context (raw storage)
    context_chain: Option<TaskContext>, // Computed: own + parent + milestone
    
    // Knowledge
    learnings: Option<InheritedLearnings>, // Computed: own + parent + milestone
    
    // Completion
    result: Option<String>,
    completed: bool,
    completed_at: Option<DateTime<Utc>>,
    
    // Prioritization
    priority: i32,                     // 1-5 (lower = higher priority)
    
    // Timestamps
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    started_at: Option<DateTime<Utc>>,
    
    // VCS Integration
    commit_sha: Option<String>,        // Auto-captured on complete
    
    // Hierarchy
    depth: Option<i32>,                // 0=milestone, 1=task, 2=subtask
    
    // Dependencies
    blocked_by: Vec<TaskId>,           // Tasks blocking this one
    blocks: Vec<TaskId>,               // Tasks this one blocks
}
```

**Key Design Decisions**:
1. **Raw Storage + Computed Fields**: `context` stored in DB, `context_chain` computed on read
2. **Lazy Dependency Loading**: `blocked_by`/`blocks` fetched separately, not JOINed
3. **Optional Depth**: NULL for legacy tasks, computed on demand
4. **Immutable IDs**: ULIDs never change, safe for foreign keys

#### Context Types

```rust
pub struct TaskContext {
    pub own: String,                   // This task's context
    pub parent: Option<String>,        // Parent task context (if depth=1)
    pub milestone: Option<String>,     // Milestone context (if depth=2)
}

pub struct InheritedLearnings {
    pub own: Vec<Learning>,            // This task's learnings
    pub parent: Vec<Learning>,         // Parent task learnings (if depth>0)
    pub milestone: Vec<Learning>,      // Milestone learnings (if depth=2)
}
```

**Inheritance Rules**:
- **Milestone** (depth=0): Only own context/learnings
- **Task** (depth=1): Own + parent (milestone)
- **Subtask** (depth=2): Own + parent + milestone (grandparent)

#### Input Types

```rust
pub struct CreateTaskInput {
    pub description: String,
    pub context: Option<String>,       // Defaults to ""
    pub parent_id: Option<TaskId>,
    pub priority: Option<i32>,         // Defaults to 3
    pub blocked_by: Vec<TaskId>,
}

pub struct UpdateTaskInput {
    pub description: Option<String>,
    pub context: Option<String>,
    pub priority: Option<i32>,
    pub result: Option<String>,
    pub parent_id: Option<Option<TaskId>>, // Double Option = set to NULL
}
```

**Pattern**: Input types are separate from domain types to enable partial updates.

### VCS Types (`os/src/vcs/backend.rs`)

```rust
pub enum VcsType {
    Jj,    // Jujutsu (jj-lib)
    Git,   // Git (gix)
    None,  // No VCS detected
}

pub trait VcsBackend: Send + Sync {
    fn status(&self) -> VcsResult<VcsStatus>;
    fn log(&self, limit: usize) -> VcsResult<Vec<LogEntry>>;
    fn diff(&self, base: Option<&str>) -> VcsResult<Vec<DiffEntry>>;
    fn commit(&self, message: &str) -> VcsResult<CommitResult>;
    fn current_commit_id(&self) -> VcsResult<String>;
}

pub struct VcsStatus {
    pub clean: bool,
    pub changed_files: Vec<String>,
    pub staged_files: Vec<String>,     // Git only
}

pub struct LogEntry {
    pub commit_id: String,
    pub message: String,
    pub author: String,
    pub timestamp: DateTime<Utc>,
}

pub struct CommitResult {
    pub commit_id: String,
    pub message: String,
}
```

**Design**: Trait-based abstraction allows plugging in new VCS backends (e.g., Mercurial, Fossil).

---

## Database Schema

**File**: `os/src/db/schema.rs`

### Tasks Table

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY CHECK (id LIKE 'task_%'),
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE 
        CHECK (parent_id LIKE 'task_%'),
    description TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    result TEXT,
    priority INTEGER NOT NULL DEFAULT 3,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    commit_sha TEXT,
    started_at TEXT
);

CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_completed ON tasks(completed);
```

**Invariants**:
- `id` must start with `task_` prefix (CHECK constraint)
- `parent_id` must reference existing task (FOREIGN KEY)
- Deleting parent cascades to children (ON DELETE CASCADE)
- Timestamps stored as RFC 3339 strings

### Learnings Table

```sql
CREATE TABLE learnings (
    id TEXT PRIMARY KEY CHECK (id LIKE 'lrn_%'),
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE 
        CHECK (task_id LIKE 'task_%'),
    content TEXT NOT NULL,
    source_task_id TEXT CHECK (source_task_id LIKE 'task_%'),
    created_at TEXT NOT NULL
);

CREATE INDEX idx_learnings_task ON learnings(task_id);
```

**Design**: `source_task_id` enables cross-task knowledge transfer (not implemented in UI yet).

### Task Blockers Table

```sql
CREATE TABLE task_blockers (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE 
        CHECK (task_id LIKE 'task_%'),
    blocker_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE 
        CHECK (blocker_id LIKE 'task_%'),
    PRIMARY KEY (task_id, blocker_id)
);

CREATE INDEX idx_blockers_blocker ON task_blockers(blocker_id);
```

**Pattern**: Junction table for many-to-many relationship.

### Database Configuration

```rust
pub fn init(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    
    // Enable foreign key enforcement
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    // Enable WAL mode for concurrent reads
    conn.execute("PRAGMA journal_mode = WAL", [])?;
    
    // Apply schema
    conn.execute(SCHEMA, [])?;
    
    Ok(conn)
}
```

**Concurrency Model**:
- **WAL Mode**: Multiple readers + single writer
- **No Connection Pooling**: Single connection per process
- **Transaction Support**: Service layer can wrap operations in transactions

---

## Repository Pattern

### Task Repository (`os/src/db/task_repo.rs`)

**Responsibilities**: Pure SQL operations, no business logic

#### Core CRUD Operations

```rust
// Create task with blockers
pub fn create_task(conn: &Connection, input: &CreateTaskInput) -> Result<Task> {
    let id = TaskId::new();
    let now = Utc::now();
    
    conn.execute(
        "INSERT INTO tasks (id, parent_id, description, context, priority, 
                           created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![id, input.parent_id, input.description, 
                input.context.as_deref().unwrap_or(""), 
                input.priority.unwrap_or(3), now, now]
    )?;
    
    // Insert blockers
    for blocker_id in &input.blocked_by {
        add_blocker(conn, &id, blocker_id)?;
    }
    
    get_task(conn, &id)?.ok_or(OsError::TaskNotFound(id))
}

// Read single task
pub fn get_task(conn: &Connection, id: &TaskId) -> Result<Option<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, description, context, result, priority, 
                completed, completed_at, created_at, updated_at, 
                commit_sha, started_at 
         FROM tasks WHERE id = ?"
    )?;
    
    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => {
            let mut task = row_to_task(row)?;
            task.blocked_by = get_blockers(conn, &task.id)?;
            task.blocks = get_blocking(conn, &task.id)?;
            Ok(Some(task))
        }
        None => Ok(None),
    }
}

// List with filtering
pub fn list_tasks(conn: &Connection, filter: &ListTasksFilter) -> Result<Vec<Task>> {
    let mut sql = String::from(
        "SELECT id, parent_id, description, context, result, priority, 
                completed, completed_at, created_at, updated_at, 
                commit_sha, started_at 
         FROM tasks WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    
    // Dynamic WHERE clause
    if let Some(ref parent_id) = filter.parent_id {
        sql.push_str(" AND parent_id = ?");
        params.push(Box::new(parent_id.clone()));
    }
    if let Some(completed) = filter.completed {
        sql.push_str(" AND completed = ?");
        params.push(Box::new(completed as i32));
    }
    
    // Execute query
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query(params.as_slice())?;
    
    let mut tasks: Vec<Task> = rows.map(row_to_task).collect::<Result<_>>()?;
    
    // Fetch blockers for each task
    for task in &mut tasks {
        task.blocked_by = get_blockers(conn, &task.id)?;
        task.blocks = get_blocking(conn, &task.id)?;
    }
    
    // Apply "ready" filter (must be done in-memory after fetching blockers)
    if filter.ready {
        tasks.retain(|t| {
            !t.completed && 
            t.blocked_by.iter().all(|blocker_id| {
                is_completed(conn, blocker_id).unwrap_or(false)
            })
        });
    }
    
    Ok(tasks)
}

// Update task
pub fn update_task(
    conn: &Connection, 
    id: &TaskId, 
    input: &UpdateTaskInput
) -> Result<Task> {
    let now = Utc::now();
    
    if let Some(description) = &input.description {
        conn.execute(
            "UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?",
            params![description, now, id]
        )?;
    }
    
    if let Some(context) = &input.context {
        conn.execute(
            "UPDATE tasks SET context = ?, updated_at = ? WHERE id = ?",
            params![context, now, id]
        )?;
    }
    
    // ... similar for other fields
    
    get_task(conn, id)?.ok_or(OsError::TaskNotFound(id.clone()))
}

// Delete task (cascades to children + learnings)
pub fn delete_task(conn: &Connection, id: &TaskId) -> Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?", [id])?;
    Ok(())
}
```

#### State Transition Operations

```rust
// Mark task as started
pub fn start_task(conn: &Connection, id: &TaskId) -> Result<Task> {
    let now = Utc::now();
    conn.execute(
        "UPDATE tasks SET started_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, id]
    )?;
    get_task(conn, id)?.ok_or(OsError::TaskNotFound(id.clone()))
}

// Mark task as completed
pub fn complete_task(
    conn: &Connection, 
    id: &TaskId, 
    result: Option<&str>,
    commit_sha: Option<&str>
) -> Result<Task> {
    let now = Utc::now();
    conn.execute(
        "UPDATE tasks SET completed = 1, completed_at = ?, result = ?, 
                         commit_sha = ?, updated_at = ? 
         WHERE id = ?",
        params![now, result, commit_sha, now, id]
    )?;
    get_task(conn, id)?.ok_or(OsError::TaskNotFound(id.clone()))
}

// Reopen completed task
pub fn reopen_task(conn: &Connection, id: &TaskId) -> Result<Task> {
    let now = Utc::now();
    conn.execute(
        "UPDATE tasks SET completed = 0, completed_at = NULL, 
                         result = NULL, updated_at = ? 
         WHERE id = ?",
        params![now, id]
    )?;
    get_task(conn, id)?.ok_or(OsError::TaskNotFound(id.clone()))
}
```

#### Blocker Operations

```rust
pub fn add_blocker(
    conn: &Connection, 
    task_id: &TaskId, 
    blocker_id: &TaskId
) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO task_blockers (task_id, blocker_id) VALUES (?, ?)",
        params![task_id, blocker_id]
    )?;
    Ok(())
}

pub fn remove_blocker(
    conn: &Connection, 
    task_id: &TaskId, 
    blocker_id: &TaskId
) -> Result<()> {
    conn.execute(
        "DELETE FROM task_blockers WHERE task_id = ? AND blocker_id = ?",
        params![task_id, blocker_id]
    )?;
    Ok(())
}

pub fn get_blockers(conn: &Connection, task_id: &TaskId) -> Result<Vec<TaskId>> {
    let mut stmt = conn.prepare(
        "SELECT blocker_id FROM task_blockers WHERE task_id = ?"
    )?;
    let rows = stmt.query_map([task_id], |row| row.get(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_blocking(conn: &Connection, blocker_id: &TaskId) -> Result<Vec<TaskId>> {
    let mut stmt = conn.prepare(
        "SELECT task_id FROM task_blockers WHERE blocker_id = ?"
    )?;
    let rows = stmt.query_map([blocker_id], |row| row.get(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
```

#### Helper Functions

```rust
pub fn task_exists(conn: &Connection, id: &TaskId) -> Result<bool> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE id = ?",
        [id],
        |row| row.get(0)
    )?;
    Ok(count > 0)
}

pub fn get_task_depth(conn: &Connection, id: &TaskId) -> Result<i32> {
    let mut depth = 0;
    let mut current_id = Some(id.clone());
    
    while let Some(cid) = current_id {
        match get_task(conn, &cid)? {
            Some(task) => {
                current_id = task.parent_id;
                depth += 1;
                if depth > 10 { // Safety check
                    return Err(OsError::ParentCycle);
                }
            }
            None => break,
        }
    }
    
    Ok(depth)
}

pub fn has_pending_children(conn: &Connection, id: &TaskId) -> Result<bool> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE parent_id = ? AND completed = 0",
        [id],
        |row| row.get(0)
    )?;
    Ok(count > 0)
}

fn is_completed(conn: &Connection, id: &TaskId) -> Result<bool> {
    let completed: i32 = conn.query_row(
        "SELECT completed FROM tasks WHERE id = ?",
        [id],
        |row| row.get(0)
    )?;
    Ok(completed != 0)
}
```

**Pattern**: Repository returns domain types (`Task`), not database types. All SQL is isolated here.

### Learning Repository (`os/src/db/learning_repo.rs`)

**Simpler than tasks**: No complex relationships, just CRUD

```rust
pub fn add_learning(
    conn: &Connection,
    task_id: &TaskId,
    content: &str,
    source_task_id: Option<&TaskId>
) -> Result<Learning> {
    let id = LearningId::new();
    let now = Utc::now();
    
    conn.execute(
        "INSERT INTO learnings (id, task_id, content, source_task_id, created_at) 
         VALUES (?, ?, ?, ?, ?)",
        params![id, task_id, content, source_task_id, now]
    )?;
    
    get_learning(conn, &id)?.ok_or(OsError::LearningNotFound(id))
}

pub fn get_learning(conn: &Connection, id: &LearningId) -> Result<Option<Learning>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, content, source_task_id, created_at 
         FROM learnings WHERE id = ?"
    )?;
    
    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => Ok(Some(row_to_learning(row)?)),
        None => Ok(None),
    }
}

pub fn list_learnings(conn: &Connection, task_id: &TaskId) -> Result<Vec<Learning>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, content, source_task_id, created_at 
         FROM learnings WHERE task_id = ? 
         ORDER BY created_at DESC"
    )?;
    
    let rows = stmt.query_map([task_id], row_to_learning)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn delete_learning(conn: &Connection, id: &LearningId) -> Result<()> {
    conn.execute("DELETE FROM learnings WHERE id = ?", [id])?;
    Ok(())
}
```

---

## Business Logic Layer

### TaskService (`os/src/core/task_service.rs`)

**Responsibilities**: Enforce invariants, compose repositories, compute derived fields

#### Constants & Configuration

```rust
const MAX_DEPTH: i32 = 2; // Milestone(0) → Task(1) → Subtask(2)
```

#### Core Invariants

The service enforces these rules **before** calling repositories:

1. **Parent Existence**: Parent task must exist
2. **Depth Limit**: Cannot exceed MAX_DEPTH (3 levels)
3. **No Parent Cycles**: Setting parent cannot create cycle
4. **No Blocker Cycles**: Adding blocker cannot create cycle
5. **Blocker Existence**: All blocker tasks must exist
6. **Pending Children**: Cannot complete task with incomplete children
7. **VCS Integration**: Auto-capture commit SHA on completion (if VCS available)

#### Service Methods

```rust
pub struct TaskService<'a> {
    conn: &'a Connection,
}

impl<'a> TaskService<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }
    
    // CREATE
    pub fn create(&self, input: &CreateTaskInput) -> Result<Task> {
        // 1. Validate parent exists
        if let Some(ref parent_id) = input.parent_id {
            if !task_repo::task_exists(self.conn, parent_id)? {
                return Err(OsError::ParentNotFound(parent_id.clone()));
            }
            
            // 2. Check depth limit
            let parent_depth = task_repo::get_task_depth(self.conn, parent_id)?;
            if parent_depth >= MAX_DEPTH {
                return Err(OsError::MaxDepthExceeded);
            }
        }
        
        // 3. Validate blockers exist
        for blocker_id in &input.blocked_by {
            if !task_repo::task_exists(self.conn, blocker_id)? {
                return Err(OsError::BlockerNotFound(blocker_id.clone()));
            }
        }
        
        // 4. Create task
        let task = task_repo::create_task(self.conn, input)?;
        
        // 5. Assemble computed fields
        self.get(&task.id)
    }
    
    // READ
    pub fn get(&self, id: &TaskId) -> Result<Task> {
        let mut task = task_repo::get_task(self.conn, id)?
            .ok_or_else(|| OsError::TaskNotFound(id.clone()))?;
        
        // Compute depth
        task.depth = Some(self.compute_depth(&task)?);
        
        // Assemble context chain
        task.context_chain = Some(self.assemble_context_chain(&task)?);
        
        // Assemble inherited learnings
        task.learnings = Some(self.assemble_inherited_learnings(&task)?);
        
        Ok(task)
    }
    
    // LIST
    pub fn list(&self, filter: &ListTasksFilter) -> Result<Vec<Task>> {
        let tasks = task_repo::list_tasks(self.conn, filter)?;
        
        // Enrich each task with computed fields
        tasks.into_iter()
            .map(|t| self.get(&t.id))
            .collect()
    }
    
    // UPDATE
    pub fn update(&self, id: &TaskId, input: &UpdateTaskInput) -> Result<Task> {
        // Validate task exists
        if !task_repo::task_exists(self.conn, id)? {
            return Err(OsError::TaskNotFound(id.clone()));
        }
        
        // Validate parent change
        if let Some(new_parent) = &input.parent_id {
            if let Some(ref parent_id) = new_parent {
                // Check parent exists
                if !task_repo::task_exists(self.conn, parent_id)? {
                    return Err(OsError::ParentNotFound(parent_id.clone()));
                }
                
                // Check depth limit
                let parent_depth = task_repo::get_task_depth(self.conn, parent_id)?;
                if parent_depth >= MAX_DEPTH {
                    return Err(OsError::MaxDepthExceeded);
                }
                
                // Check for cycle
                if self.would_create_parent_cycle(id, parent_id)? {
                    return Err(OsError::ParentCycle);
                }
            }
        }
        
        task_repo::update_task(self.conn, id, input)?;
        self.get(id)
    }
    
    // DELETE
    pub fn delete(&self, id: &TaskId) -> Result<()> {
        // Cascade handled by database (ON DELETE CASCADE)
        task_repo::delete_task(self.conn, id)
    }
    
    // STATE TRANSITIONS
    pub fn start(&self, id: &TaskId) -> Result<Task> {
        task_repo::start_task(self.conn, id)?;
        self.get(id)
    }
    
    pub fn complete(&self, id: &TaskId, result: Option<&str>) -> Result<Task> {
        // Check for pending children
        if task_repo::has_pending_children(self.conn, id)? {
            return Err(OsError::PendingChildren);
        }
        
        // Capture VCS commit SHA
        let commit_sha = self.get_current_commit_sha();
        
        task_repo::complete_task(self.conn, id, result, commit_sha.as_deref())?;
        self.get(id)
    }
    
    pub fn reopen(&self, id: &TaskId) -> Result<Task> {
        task_repo::reopen_task(self.conn, id)?;
        self.get(id)
    }
    
    // BLOCKERS
    pub fn add_blocker(&self, task_id: &TaskId, blocker_id: &TaskId) -> Result<()> {
        // Validate both tasks exist
        if !task_repo::task_exists(self.conn, task_id)? {
            return Err(OsError::TaskNotFound(task_id.clone()));
        }
        if !task_repo::task_exists(self.conn, blocker_id)? {
            return Err(OsError::BlockerNotFound(blocker_id.clone()));
        }
        
        // Check for cycle
        if self.would_create_blocker_cycle(task_id, blocker_id)? {
            return Err(OsError::BlockerCycle);
        }
        
        task_repo::add_blocker(self.conn, task_id, blocker_id)
    }
    
    pub fn remove_blocker(&self, task_id: &TaskId, blocker_id: &TaskId) -> Result<()> {
        task_repo::remove_blocker(self.conn, task_id, blocker_id)
    }
}
```

#### Cycle Detection Algorithms

**Parent Chain Cycle Detection**:
```rust
fn would_create_parent_cycle(&self, task_id: &TaskId, new_parent_id: &TaskId) -> Result<bool> {
    // Walk upward from new_parent_id
    let mut current = Some(new_parent_id.clone());
    
    while let Some(ref cid) = current {
        if cid == task_id {
            return Ok(true); // Cycle: task would be its own ancestor
        }
        
        let task = task_repo::get_task(self.conn, cid)?;
        current = task.and_then(|t| t.parent_id);
    }
    
    Ok(false) // No cycle
}
```

**Blocker Chain Cycle Detection** (DFS):
```rust
fn would_create_blocker_cycle(&self, task_id: &TaskId, new_blocker_id: &TaskId) -> Result<bool> {
    // DFS from new_blocker_id following blocker edges
    let mut visited = HashSet::new();
    let mut stack = vec![new_blocker_id.clone()];
    
    while let Some(current) = stack.pop() {
        if &current == task_id {
            return Ok(true); // Cycle: task_id reached via blockers
        }
        
        if visited.contains(&current) {
            continue; // Already explored this node
        }
        visited.insert(current.clone());
        
        // Add all blockers of current to stack
        let blockers = task_repo::get_blockers(self.conn, &current)?;
        stack.extend(blockers);
    }
    
    Ok(false) // No cycle
}
```

**Design Note**: Parent cycle detection is simpler (tree structure) than blocker cycle detection (DAG structure).

#### Context Assembly

```rust
fn assemble_context_chain(&self, task: &Task) -> Result<TaskContext> {
    let depth = task.depth.unwrap_or(0);
    
    match depth {
        0 => {
            // Milestone: only own context
            Ok(TaskContext {
                own: task.context.clone(),
                parent: None,
                milestone: None,
            })
        }
        1 => {
            // Task: own + parent (milestone)
            let parent = self.get_parent(task)?;
            Ok(TaskContext {
                own: task.context.clone(),
                parent: parent.as_ref().map(|p| p.context.clone()),
                milestone: None,
            })
        }
        _ => {
            // Subtask: own + parent + milestone
            let parent = self.get_parent(task)?;
            let milestone = parent.as_ref()
                .and_then(|p| p.parent_id.as_ref())
                .map(|mid| self.get(mid))
                .transpose()?;
            
            Ok(TaskContext {
                own: task.context.clone(),
                parent: parent.as_ref().map(|p| p.context.clone()),
                milestone: milestone.as_ref().map(|m| m.context.clone()),
            })
        }
    }
}
```

#### Learnings Assembly

```rust
fn assemble_inherited_learnings(&self, task: &Task) -> Result<InheritedLearnings> {
    let depth = task.depth.unwrap_or(0);
    
    let own = learning_repo::list_learnings(self.conn, &task.id)?;
    
    match depth {
        0 => {
            // Milestone: no inheritance
            Ok(InheritedLearnings {
                own,
                parent: vec![],
                milestone: vec![],
            })
        }
        1 => {
            // Task: inherit from parent (milestone)
            let parent = self.get_parent(task)?;
            let parent_learnings = parent.as_ref()
                .map(|p| learning_repo::list_learnings(self.conn, &p.id))
                .transpose()?
                .unwrap_or_default();
            
            Ok(InheritedLearnings {
                own,
                parent: parent_learnings,
                milestone: vec![],
            })
        }
        _ => {
            // Subtask: inherit from parent + milestone
            let parent = self.get_parent(task)?;
            let parent_learnings = parent.as_ref()
                .map(|p| learning_repo::list_learnings(self.conn, &p.id))
                .transpose()?
                .unwrap_or_default();
            
            let milestone = parent.as_ref()
                .and_then(|p| p.parent_id.as_ref())
                .map(|mid| self.get(mid))
                .transpose()?;
            let milestone_learnings = milestone.as_ref()
                .map(|m| learning_repo::list_learnings(self.conn, &m.id))
                .transpose()?
                .unwrap_or_default();
            
            Ok(InheritedLearnings {
                own,
                parent: parent_learnings,
                milestone: milestone_learnings,
            })
        }
    }
}
```

#### VCS Integration

```rust
fn get_current_commit_sha(&self) -> Option<String> {
    let cwd = std::env::current_dir().ok()?;
    let backend = vcs::get_backend(&cwd).ok()?;
    backend.current_commit_id().ok()
}
```

**Design**: VCS errors are silent (returns `None`). Tasks can be completed without VCS.

---

## VCS Integration

### Detection Strategy (`os/src/vcs/detection.rs`)

**Algorithm**: Walk up directory tree, check for `.jj/` or `.git/`

```rust
pub fn detect_vcs_type(start: &Path) -> (VcsType, Option<PathBuf>) {
    let mut current = start.to_path_buf();
    
    loop {
        // JJ PRIORITY: Always check .jj/ first
        if current.join(".jj").exists() {
            return (VcsType::Jj, Some(current));
        }
        
        if current.join(".git").exists() {
            return (VcsType::Git, Some(current));
        }
        
        // Move up to parent directory
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => return (VcsType::None, None),
        }
    }
}
```

**Design Decision**: `.jj/` check always comes first → **jj-first architecture**.

### JJ Backend (`os/src/vcs/jj.rs`)

**Key Insight**: Uses `jj-lib` directly (no subprocess), giving native Rust API access.

#### Initialization

```rust
pub struct JjBackend {
    root: PathBuf,
    settings: UserSettings,
}

impl JjBackend {
    pub fn open(root: &Path) -> VcsResult<Self> {
        // Configure jj settings
        let config = config::Config::builder()
            .set_default("user.name", "Overseer")?
            .set_default("user.email", "overseer@localhost")?
            .build()?;
        
        let settings = UserSettings::from_config(config)?;
        
        Ok(Self {
            root: root.to_path_buf(),
            settings,
        })
    }
    
    fn workspace(&self) -> VcsResult<Workspace> {
        Workspace::load(&self.settings, &self.root, &StoreFactories::default())
            .map_err(|e| VcsError::Backend(format!("Failed to load workspace: {}", e)))
    }
}
```

#### Status Implementation

```rust
impl VcsBackend for JjBackend {
    fn status(&self) -> VcsResult<VcsStatus> {
        let ws = self.workspace()?;
        let repo = ws.repo_loader().load_at_head(&self.settings)?;
        let wc_commit_id = ws.working_copy().current_commit_id();
        let wc_commit = repo.store().get_commit(wc_commit_id)?;
        
        // Check if working copy has changes
        let clean = wc_commit.is_empty(&repo.store())?;
        
        // Get changed files (compare to parent)
        let parent = repo.store().get_commit(wc_commit.parent_ids()[0])?;
        let diff = wc_commit.tree()?.diff(&parent.tree()?)?;
        
        let mut changed_files = Vec::new();
        for (path, _) in diff {
            changed_files.push(path.to_string());
        }
        
        Ok(VcsStatus {
            clean,
            changed_files,
            staged_files: vec![], // jj doesn't have staging
        })
    }
}
```

#### Commit Implementation

**JJ's Unique Workflow**: Working copy IS a commit

```rust
fn commit(&self, message: &str) -> VcsResult<CommitResult> {
    let ws = self.workspace()?;
    let mut repo = ws.repo_loader().load_at_head(&self.settings)?;
    
    let wc_commit_id = ws.working_copy().current_commit_id();
    let wc_commit = repo.store().get_commit(wc_commit_id)?;
    
    // 1. Check if working copy has changes
    if wc_commit.is_empty(&repo.store())? {
        return Err(VcsError::NoChanges);
    }
    
    // 2. Start transaction
    let mut tx = repo.start_transaction(&self.settings, "describe working copy");
    let mut_repo = tx.mut_repo();
    
    // 3. Rewrite working copy commit with new description
    let mut commit_builder = mut_repo
        .rewrite_commit(&self.settings, &wc_commit)
        .set_description(message);
    
    let new_commit = commit_builder.write()?;
    
    // 4. Create new empty working copy commit
    let new_wc_commit = mut_repo
        .new_commit(&self.settings, vec![new_commit.id().clone()], new_commit.tree_id().clone())
        .set_description("(working copy)")
        .write()?;
    
    // 5. Update working copy pointer
    ws.working_copy_mut().set_current_commit(new_wc_commit.id())?;
    
    // 6. Rebase descendants
    mut_repo.rebase_descendants(&self.settings)?;
    
    // 7. Commit transaction
    tx.commit();
    
    Ok(CommitResult {
        commit_id: new_commit.id().hex(),
        message: message.to_string(),
    })
}
```

**Why This Workflow?**:
- jj's working copy is always a commit (not just unstaged changes)
- "Committing" = describe working copy + create new empty working copy
- Descendants automatically rebased (jj-lib invariant)

#### Log Implementation

```rust
fn log(&self, limit: usize) -> VcsResult<Vec<LogEntry>> {
    let ws = self.workspace()?;
    let repo = ws.repo_loader().load_at_head(&self.settings)?;
    let wc_commit_id = ws.working_copy().current_commit_id();
    
    let mut entries = Vec::new();
    let mut current_id = wc_commit_id.clone();
    
    for _ in 0..limit {
        let commit = repo.store().get_commit(&current_id)?;
        
        // Skip empty working copy commits
        if !commit.is_empty(&repo.store())? {
            entries.push(LogEntry {
                commit_id: commit.id().hex(),
                message: commit.description().to_string(),
                author: format!("{} <{}>", 
                    commit.author().name, 
                    commit.author().email),
                timestamp: commit.author().timestamp.timestamp,
            });
        }
        
        // Move to parent
        match commit.parent_ids().first() {
            Some(parent_id) => current_id = parent_id.clone(),
            None => break,
        }
    }
    
    Ok(entries)
}
```

### Git Backend (`os/src/vcs/git.rs`)

**Hybrid Approach**: Uses `gix` for read operations, falls back to `git` CLI for commits

#### Initialization

```rust
pub struct GixBackend {
    repo: gix::Repository,
}

impl GixBackend {
    pub fn open(root: &Path) -> VcsResult<Self> {
        let repo = gix::open(root)
            .map_err(|e| VcsError::Backend(format!("Failed to open git repo: {}", e)))?;
        
        Ok(Self { repo })
    }
}
```

#### Status Implementation (Pure gix)

```rust
impl VcsBackend for GixBackend {
    fn status(&self) -> VcsResult<VcsStatus> {
        // Use gix status API
        let status_platform = self.repo
            .status(gix::progress::Discard)?;
        
        let mut changed_files = Vec::new();
        let mut staged_files = Vec::new();
        
        for entry in status_platform.index_worktree()? {
            let path = entry.rela_path().to_string();
            
            if entry.status().is_modified() {
                changed_files.push(path.clone());
            }
            
            if entry.status().is_staged() {
                staged_files.push(path);
            }
        }
        
        let clean = changed_files.is_empty() && staged_files.is_empty();
        
        Ok(VcsStatus {
            clean,
            changed_files,
            staged_files,
        })
    }
}
```

#### Log Implementation (Pure gix)

```rust
fn log(&self, limit: usize) -> VcsResult<Vec<LogEntry>> {
    // Get HEAD commit
    let head = self.repo.head()?;
    let head_commit = head.peel_to_commit()?;
    
    // Rev-walk from HEAD
    let mut entries = Vec::new();
    let revwalk = self.repo.rev_walk([head_commit.id()]).all()?;
    
    for commit_id in revwalk.take(limit) {
        let commit_id = commit_id?;
        let commit = self.repo.find_commit(commit_id)?;
        
        entries.push(LogEntry {
            commit_id: commit.id().to_string(),
            message: commit.message()?.to_string(),
            author: format!("{} <{}>", 
                commit.author()?.name, 
                commit.author()?.email),
            timestamp: commit.author()?.time.seconds,
        });
    }
    
    Ok(entries)
}
```

#### Commit Implementation (CLI Fallback)

```rust
fn commit(&self, message: &str) -> VcsResult<CommitResult> {
    // Stage all changes
    let output = Command::new("git")
        .args(["add", "-A"])
        .current_dir(self.repo.work_dir().ok_or(VcsError::NotARepository)?)
        .output()
        .map_err(|e| VcsError::Backend(format!("Failed to run git add: {}", e)))?;
    
    if !output.status.success() {
        return Err(VcsError::Backend(format!(
            "git add failed: {}", 
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    
    // Commit
    let output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(self.repo.work_dir().ok_or(VcsError::NotARepository)?)
        .output()
        .map_err(|e| VcsError::Backend(format!("Failed to run git commit: {}", e)))?;
    
    if !output.status.success() {
        return Err(VcsError::Backend(format!(
            "git commit failed: {}", 
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    
    // Get commit ID
    let commit_id = self.current_commit_id()?;
    
    Ok(CommitResult {
        commit_id,
        message: message.to_string(),
    })
}
```

**Rationale**: gix commit API is more complex than read APIs. CLI fallback is pragmatic for MVP.

---

## Codemode Pattern

### The Pattern

**Traditional MCP**: Agent calls tool → Server executes → Returns result

**Codemode MCP**: Agent writes JS → Server executes in VM → JS calls high-level API → Returns result

```
Traditional:
  Agent → "list_tasks" tool → Server → CLI → Result

Codemode:
  Agent → "await tasks.list()" code → VM → API → CLI → Result
```

**Benefits**:
1. **Composability**: Agents can write complex logic (loops, conditionals, error handling)
2. **Type Safety**: TypeScript APIs provide better guardrails than raw tool calls
3. **Debugging**: Agent code visible in prompts, easier to trace issues
4. **Flexibility**: Add new operations without new MCP tools

### Execute Tool (`mcp/src/executor.ts`)

**Core of the pattern**: VM sandbox with exposed APIs

```typescript
export async function execute(code: string): Promise<unknown> {
    // 1. Create sandbox with exposed APIs
    const sandbox = {
        tasks,      // Full tasks API (16 operations)
        learnings,  // Full learnings API (3 operations)
        vcs,        // Full VCS API (5 operations)
        console,    // Logging support
        Promise,    // Async support
    };
    
    // 2. Wrap in async IIFE (so await works)
    const wrappedCode = `
        (async () => {
            ${code}
        })()
    `;
    
    // 3. Compile and execute in VM context (30s timeout)
    const script = new vm.Script(wrappedCode, {
        filename: 'agent-code.js',
    });
    
    const context = vm.createContext(sandbox);
    
    const result = await script.runInContext(context, {
        timeout: 30_000, // 30s timeout
    });
    
    // 4. Truncate large outputs (prevent token overflow)
    return truncateOutput(result);
}

function truncateOutput(value: unknown): unknown {
    const str = JSON.stringify(value);
    if (str.length > 10_000) {
        return str.slice(0, 10_000) + '\n[... truncated]';
    }
    return value;
}
```

**Security Model**:
- **Isolated Context**: No access to Node.js globals (`require`, `process`, `fs`, etc.)
- **No Filesystem**: Cannot read/write files directly
- **No Network**: Cannot make HTTP requests (except via exposed APIs)
- **Timeout Protection**: 30s execution limit
- **Deterministic APIs**: All APIs interact with local CLI

### API Layer (`mcp/src/api/`)

#### Tasks API (`mcp/src/api/tasks.ts`)

**16 operations exposed to agents**:

```typescript
export const tasks = {
    // CREATE
    async create(input: CreateTaskInput): Promise<Task> {
        return callCli([
            'task', 'create',
            '-d', input.description,
            ...(input.context ? ['--context', input.context] : []),
            ...(input.parentId ? ['--parent', input.parentId] : []),
            ...(input.priority ? ['--priority', input.priority.toString()] : []),
            ...(input.blockedBy?.flatMap(id => ['--blocker', id]) ?? []),
        ]) as Promise<Task>;
    },
    
    // READ
    async get(id: string): Promise<Task> {
        return callCli(['task', 'get', id]) as Promise<Task>;
    },
    
    async list(filter?: ListTasksFilter): Promise<Task[]> {
        const args = ['task', 'list'];
        if (filter?.parentId) args.push('--parent', filter.parentId);
        if (filter?.completed !== undefined) args.push('--completed', String(filter.completed));
        if (filter?.ready) args.push('--ready');
        return callCli(args) as Promise<Task[]>;
    },
    
    // UPDATE
    async update(id: string, input: UpdateTaskInput): Promise<Task> {
        const args = ['task', 'update', id];
        if (input.description) args.push('-d', input.description);
        if (input.context) args.push('--context', input.context);
        if (input.priority) args.push('--priority', input.priority.toString());
        if (input.result) args.push('--result', input.result);
        if (input.parentId !== undefined) {
            args.push('--parent', input.parentId ?? 'null');
        }
        return callCli(args) as Promise<Task>;
    },
    
    // DELETE
    async delete(id: string): Promise<void> {
        await callCli(['task', 'delete', id]);
    },
    
    // STATE TRANSITIONS
    async start(id: string): Promise<Task> {
        return callCli(['task', 'start', id]) as Promise<Task>;
    },
    
    async complete(id: string, result?: string): Promise<Task> {
        const args = ['task', 'complete', id];
        if (result) args.push('--result', result);
        return callCli(args) as Promise<Task>;
    },
    
    async reopen(id: string): Promise<Task> {
        return callCli(['task', 'reopen', id]) as Promise<Task>;
    },
    
    // BLOCKERS
    async addBlocker(taskId: string, blockerId: string): Promise<void> {
        await callCli(['task', 'block', taskId, blockerId]);
    },
    
    async removeBlocker(taskId: string, blockerId: string): Promise<void> {
        await callCli(['task', 'unblock', taskId, blockerId]);
    },
    
    // QUERIES
    async nextReady(milestoneId?: string): Promise<Task | null> {
        const args = ['task', 'next-ready'];
        if (milestoneId) args.push('--milestone', milestoneId);
        return callCli(args) as Promise<Task | null>;
    },
    
    async tree(rootId: string): Promise<TaskTree> {
        return callCli(['task', 'tree', rootId]) as Promise<TaskTree>;
    },
    
    async search(query: string): Promise<Task[]> {
        return callCli(['task', 'search', query]) as Promise<Task[]>;
    },
    
    // IMPORT/EXPORT
    async export(path: string): Promise<void> {
        await callCli(['data', 'export', path]);
    },
    
    async import(path: string, clear?: boolean): Promise<void> {
        const args = ['data', 'import', path];
        if (clear) args.push('--clear');
        await callCli(args);
    },
};
```

#### Learnings API (`mcp/src/api/learnings.ts`)

```typescript
export const learnings = {
    async add(taskId: string, content: string, sourceTaskId?: string): Promise<Learning> {
        const args = ['learning', 'add', taskId, content];
        if (sourceTaskId) args.push('--source', sourceTaskId);
        return callCli(args) as Promise<Learning>;
    },
    
    async list(taskId: string): Promise<Learning[]> {
        return callCli(['learning', 'list', taskId]) as Promise<Learning[]>;
    },
    
    async delete(id: string): Promise<void> {
        await callCli(['learning', 'delete', id]);
    },
};
```

#### VCS API (`mcp/src/api/vcs.ts`)

```typescript
export const vcs = {
    async detect(): Promise<{ type: 'jj' | 'git' | 'none'; root?: string }> {
        return callCli(['vcs', 'detect']) as Promise<{ type: string; root?: string }>;
    },
    
    async status(): Promise<VcsStatus> {
        return callCli(['vcs', 'status']) as Promise<VcsStatus>;
    },
    
    async log(limit?: number): Promise<LogEntry[]> {
        const args = ['vcs', 'log'];
        if (limit) args.push('--limit', limit.toString());
        return callCli(args) as Promise<LogEntry[]>;
    },
    
    async diff(base?: string): Promise<DiffEntry[]> {
        const args = ['vcs', 'diff'];
        if (base) args.push('--base', base);
        return callCli(args) as Promise<DiffEntry[]>;
    },
    
    async commit(message: string): Promise<{ commitId: string; message: string }> {
        return callCli(['vcs', 'commit', '-m', message]) as Promise<CommitResult>;
    },
};
```

### CLI Bridge (`mcp/src/cli.ts`)

**Spawns Rust CLI, parses JSON**:

```typescript
const CLI_PATH = path.join(__dirname, '../../target/release/os');
const CLI_CWD = process.cwd();

export async function callCli(args: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
        // Always add --json flag
        const fullArgs = [...args, '--json'];
        
        const proc = spawn(CLI_PATH, fullArgs, {
            cwd: CLI_CWD,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        // 30s timeout
        const timeout = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new CliTimeoutError());
        }, 30_000);
        
        proc.on('close', (code) => {
            clearTimeout(timeout);
            
            if (code !== 0) {
                reject(new CliError(
                    `CLI exited with code ${code}`,
                    code ?? -1,
                    stderr
                ));
                return;
            }
            
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (err) {
                reject(new Error(`Failed to parse CLI output: ${err}`));
            }
        });
        
        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
```

---

## Data Flow

### Task Creation Example

**Agent Code**:
```javascript
const task = await tasks.create({
    description: "Implement user authentication",
    parentId: "task_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    context: "Use JWT for token-based auth",
    priority: 1,
    blockedBy: ["task_01BRZ3NDEKTSV4RRFFQ69G5FAV"]
});
```

**Flow**:
1. **MCP Executor** (`executor.ts`): Executes agent code in VM sandbox
2. **Tasks API** (`api/tasks.ts`): `tasks.create()` called
3. **CLI Bridge** (`cli.ts`): Spawns `os task create -d "..." --parent "..." --context "..." --priority 1 --blocker "..." --json`
4. **CLI Entry** (`main.rs`): Parses args with clap
5. **Command Router** (`main.rs`): Calls `commands::task::handle(TaskCommand::Create)`
6. **Task Handler** (`commands/task.rs`): Calls `TaskService::create()`
7. **Task Service** (`core/task_service.rs`):
   - Validates parent exists
   - Checks depth limit (parent depth < MAX_DEPTH)
   - Validates blockers exist
   - Calls `task_repo::create_task()`
8. **Task Repo** (`db/task_repo.rs`):
   - Generates new TaskId (ULID)
   - INSERT INTO tasks
   - INSERT INTO task_blockers (for each blocker)
   - SELECT task back with all fields
9. **Task Service**: Enriches task:
   - Compute depth (walk parent chain)
   - Assemble context chain (own + parent + milestone)
   - Assemble inherited learnings (own + parent + milestone)
10. **Command Handler**: Serializes Task to JSON
11. **CLI Bridge**: Parses JSON, returns to API
12. **Tasks API**: Returns Task to agent code
13. **MCP Executor**: Returns Task to agent

**Total Latency**: ~10-50ms (mostly SQLite + JSON serialization)

### Context Chain Retrieval Example

**Agent Code**:
```javascript
const task = await tasks.get("task_01ARZ3NDEKTSV4RRFFQ69G5FAV");
console.log(task.contextChain);
// { own: "...", parent: "...", milestone: "..." }
```

**Flow**:
1. CLI: `os task get task_... --json`
2. `TaskService::get()`:
   - Fetch task from repo
   - Compute depth: Walk parent chain until root (0 levels up = milestone, 1 = task, 2 = subtask)
   - Assemble context chain:
     - Own: task.context
     - Parent: Fetch parent task, get parent.context
     - Milestone: Fetch grandparent task (if depth=2), get grandparent.context
   - Assemble learnings: Similar traversal
3. Return Task with `context_chain` and `learnings` populated
4. Serialize to JSON → Parse → Return

**Key Insight**: Context chain is **computed on read**, not stored. This avoids denormalization and ensures consistency.

---

## Key Algorithms

### Next Ready Task Selection

**Algorithm**: Priority-based selection with blocker awareness

```rust
pub fn handle_next_ready(
    conn: &Connection, 
    milestone_id: Option<&TaskId>
) -> Result<Option<Task>> {
    let svc = TaskService::new(conn);
    
    // 1. Filter for ready tasks (not completed, not blocked)
    let filter = ListTasksFilter {
        parent_id: milestone_id.cloned(),
        ready: true,  // Filters out blocked tasks
        completed: Some(false),
    };
    
    let mut ready_tasks = svc.list(&filter)?;
    
    // 2. Sort by priority (ascending = higher priority first), then created_at
    ready_tasks.sort_by(|a, b| {
        a.priority.cmp(&b.priority)
            .then_with(|| a.created_at.cmp(&b.created_at))
    });
    
    // 3. Return first task (highest priority, oldest if tied)
    Ok(ready_tasks.into_iter().next())
}
```

**"Ready" Definition** (in `task_repo::list_tasks()`):
```rust
if filter.ready {
    tasks.retain(|t| {
        !t.completed && 
        t.blocked_by.iter().all(|blocker_id| {
            is_completed(conn, blocker_id).unwrap_or(false)
        })
    });
}
```

**Usage**: Agents call `await tasks.nextReady()` to get next actionable task.

### Task Tree Construction

**Recursive hierarchy builder**:

```rust
pub struct TaskTree {
    pub task: Task,
    pub children: Vec<TaskTree>,
}

fn build_tree(conn: &Connection, root_id: &TaskId) -> Result<TaskTree> {
    let svc = TaskService::new(conn);
    
    // 1. Get root task (with full context/learnings)
    let task = svc.get(root_id)?;
    
    // 2. Get all children
    let children_tasks = svc.list(&ListTasksFilter {
        parent_id: Some(root_id.clone()),
        ready: false,
        completed: None,
    })?;
    
    // 3. Recursively build trees for children
    let mut children = Vec::new();
    for child in children_tasks {
        children.push(build_tree(conn, &child.id)?);
    }
    
    Ok(TaskTree { task, children })
}
```

**Output**: Nested JSON structure showing full hierarchy.

### Export/Import with Topological Sort

**Export** (`commands/data.rs`):
```rust
pub fn handle_export(conn: &Connection, path: &Path) -> Result<()> {
    let svc = TaskService::new(conn);
    
    // 1. Read all tasks (no filter)
    let tasks = svc.list(&ListTasksFilter::default())?;
    
    // 2. Read all learnings
    let mut all_learnings = Vec::new();
    for task in &tasks {
        let learnings = learning_repo::list_learnings(conn, &task.id)?;
        all_learnings.extend(learnings);
    }
    
    // 3. Serialize to JSON
    let export = ExportData {
        version: 1,
        tasks,
        learnings: all_learnings,
        exported_at: Utc::now(),
    };
    
    let json = serde_json::to_string_pretty(&export)?;
    std::fs::write(path, json)?;
    
    Ok(())
}
```

**Import** (`commands/data.rs`):
```rust
pub fn handle_import(conn: &Connection, path: &Path, clear: bool) -> Result<()> {
    // 1. Parse JSON
    let json = std::fs::read_to_string(path)?;
    let import: ExportData = serde_json::from_str(&json)?;
    
    // 2. Optionally clear existing data
    if clear {
        conn.execute("DELETE FROM tasks", [])?;
        conn.execute("DELETE FROM learnings", [])?;
    }
    
    // 3. Topologically sort tasks (parents before children)
    let mut tasks_by_depth: Vec<(i32, &Task)> = import.tasks
        .iter()
        .map(|t| (compute_depth(t, &import.tasks), t))
        .collect();
    
    tasks_by_depth.sort_by_key(|(depth, _)| *depth);
    
    // 4. Insert tasks in order (ensures parents exist)
    for (_, task) in tasks_by_depth {
        // Direct INSERT (bypasses validation)
        conn.execute(
            "INSERT INTO tasks (...) VALUES (...)",
            params![...],
        )?;
        
        // Insert blockers
        for blocker_id in &task.blocked_by {
            task_repo::add_blocker(conn, &task.id, blocker_id)?;
        }
    }
    
    // 5. Insert learnings
    for learning in &import.learnings {
        conn.execute(
            "INSERT INTO learnings (...) VALUES (...)",
            params![...],
        )?;
    }
    
    Ok(())
}

fn compute_depth(task: &Task, all_tasks: &[Task]) -> i32 {
    let mut depth = 0;
    let mut current = task;
    
    while let Some(ref parent_id) = current.parent_id {
        depth += 1;
        current = all_tasks.iter().find(|t| &t.id == parent_id)
            .expect("Parent must exist in export");
    }
    
    depth
}
```

**Key Insight**: Topological sort ensures parents are inserted before children, satisfying foreign key constraints.

---

## Error Handling

### Rust Error Hierarchy

```rust
#[derive(Error, Debug)]
pub enum OsError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    
    #[error("Task not found: {0}")]
    TaskNotFound(TaskId),
    
    #[error("Parent task not found: {0}")]
    ParentNotFound(TaskId),
    
    #[error("Blocker task not found: {0}")]
    BlockerNotFound(TaskId),
    
    #[error("Learning not found: {0}")]
    LearningNotFound(LearningId),
    
    #[error("Maximum depth exceeded: subtasks cannot have children")]
    MaxDepthExceeded,
    
    #[error("Cycle detected in parent chain")]
    ParentCycle,
    
    #[error("Cycle detected in blocker chain")]
    BlockerCycle,
    
    #[error("Cannot complete task with pending children")]
    PendingChildren,
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    
    #[error("VCS error: {0}")]
    Vcs(#[from] VcsError),
}

pub type Result<T> = std::result::Result<T, OsError>;
```

**Pattern**: All operations return `Result<T>`. Errors propagate with `?`.

### JSON Error Output

**CLI** (`main.rs`):
```rust
fn main() {
    let cli = Cli::parse();
    
    let result = run(&cli);
    
    match result {
        Ok(output) => {
            if cli.json {
                println!("{}", serde_json::to_string(&output).unwrap());
            } else {
                print_human(&cli.command, &output);
            }
        }
        Err(err) => {
            if cli.json {
                let error_json = json!({
                    "error": err.to_string(),
                });
                eprintln!("{}", serde_json::to_string(&error_json).unwrap());
            } else {
                eprintln!("Error: {}", err);
            }
            std::process::exit(1);
        }
    }
}
```

### TypeScript Error Handling

```typescript
export class CliError extends Error {
    constructor(
        message: string,
        public exitCode: number,
        public stderr: string
    ) {
        super(message);
        this.name = 'CliError';
    }
}

export class CliTimeoutError extends Error {
    constructor(message = "CLI command timeout (30s)") {
        super(message);
        this.name = 'CliTimeoutError';
    }
}

export class ExecutionError extends Error {
    constructor(
        message: string,
        public readonly stackTrace?: string
    ) {
        super(message);
        this.name = 'ExecutionError';
    }
}
```

**Flow**: CLI errors → MCP catches → Returns as `{ isError: true, content: [...] }` to agent.

---

## Design Patterns

### Repository Pattern
- **Separation**: `db/` for SQL, `core/` for business logic
- **Invariant**: Repos return `Result<T>`, no panics
- **Transactions**: Single connection passed through, relies on SQLite WAL mode

### Service Layer Pattern
- `TaskService` wraps `Connection`
- Validates invariants before calling repos
- Assembles computed fields (context chain, learnings)
- Services can be composed (e.g., `TaskService` uses `LearningRepo`)

### Dependency Injection
- `Connection` passed to services/repos (no global state)
- `VcsBackend` returned by factory function
- Enables testing with in-memory SQLite (`:memory:`)

### Newtype Pattern
- `TaskId`, `LearningId` are distinct types (not just `String`)
- Prevents mixing IDs
- Validated on parse (prefix + ULID format)

### Trait-Based Abstraction
- `VcsBackend` trait allows pluggable VCS backends
- `JjBackend` and `GixBackend` implement trait
- Factory function (`vcs::get_backend()`) returns `Box<dyn VcsBackend>`

---

## Testing Strategy

### Rust Tests

**Unit Tests**: Inline with modules
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_task_creation() {
        let conn = Connection::open_in_memory().unwrap();
        db::init_schema(&conn).unwrap();
        
        let svc = TaskService::new(&conn);
        let task = svc.create(&CreateTaskInput {
            description: "Test task".to_string(),
            ..Default::default()
        }).unwrap();
        
        assert_eq!(task.description, "Test task");
        assert!(task.id.to_string().starts_with("task_"));
    }
}
```

**Integration Tests**: `tests/` directory
```rust
#[test]
fn test_jj_integration() {
    let test_repo = JjTestRepo::new().unwrap();
    let backend = test_repo.backend().unwrap();
    
    test_repo.write_file("foo.txt", "content").unwrap();
    
    let status = backend.status().unwrap();
    assert!(!status.clean);
    
    let result = backend.commit("Add foo.txt").unwrap();
    assert!(result.commit_id.len() > 0);
}
```

**Test Utilities** (`testutil.rs`):
```rust
pub trait TestRepo {
    fn new() -> Result<Self> where Self: Sized;
    fn path(&self) -> &Path;
    fn backend(&self) -> Result<Box<dyn VcsBackend>>;
    fn write_file(&self, path: &str, content: &str) -> Result<()>;
    fn commit(&self, message: &str) -> Result<String>;
}

pub struct JjTestRepo {
    temp_dir: TempDir,
}

impl TestRepo for JjTestRepo {
    fn new() -> Result<Self> {
        let temp_dir = TempDir::new()?;
        let path = temp_dir.path();
        
        // Initialize jj repo
        Command::new("jj")
            .args(["init", "--git"])
            .current_dir(path)
            .output()?;
        
        Ok(Self { temp_dir })
    }
    
    // ... implementation
}
```

### TypeScript Tests

**Unit Tests** (`mcp/src/tests/`):
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execute } from '../executor';

describe('executor', () => {
    it('executes simple code', async () => {
        const result = await execute('return 1 + 1');
        assert.strictEqual(result, 2);
    });
    
    it('supports async code', async () => {
        const result = await execute(`
            const task = await tasks.create({ description: 'Test' });
            return task.id;
        `);
        assert.ok(result.startsWith('task_'));
    });
    
    it('enforces timeout', async () => {
        await assert.rejects(
            execute('while (true) {}'),
            { name: 'Error' }
        );
    });
});
```

---

## Architecture Decisions

### Why Codemode Pattern?
- **Flexibility**: Agents can compose complex operations (loops, conditionals)
- **Type Safety**: TypeScript APIs provide better guardrails than raw tool calls
- **Debugging**: Agent code visible in prompts, easier to trace issues
- **Extensibility**: Add new APIs without new MCP tools
- **LLM-Friendly**: TypeScript easier for LLMs than custom tool schema

### Why Rust CLI?
- **Performance**: Native SQLite bindings (no FFI overhead)
- **Type Safety**: Strong compile-time guarantees prevent bugs
- **VCS Integration**: jj-lib/gix are Rust libraries (native API access)
- **Portability**: Single binary, no runtime dependencies
- **Robustness**: Rust's error handling (`Result<T>`) forces handling edge cases

### Why SQLite?
- **Simplicity**: File-based, no server setup
- **Concurrency**: WAL mode supports concurrent reads + single writer
- **Transactions**: ACID guarantees for complex operations
- **Portability**: Cross-platform, embeddable, well-tested
- **Performance**: Sub-millisecond queries for task management workloads

### Why jj-lib Priority?
- **Native API**: No subprocess overhead (10x faster than CLI)
- **Richer Model**: Change-based (not commit-based) maps better to agent workflows
- **Agent-Friendly**: Working copy changes visible immediately (no staging)
- **Future-Proof**: jj gaining adoption, better for multi-agent coordination
- **Pure Rust**: No C dependencies, easier to build/deploy

### Why Separate Repos + Services?
- **Testability**: Repos testable with in-memory DB (no fixtures)
- **Separation of Concerns**: SQL vs business logic clearly separated
- **Reusability**: Services can call multiple repos (composition)
- **Clarity**: Clear boundary between persistence and domain logic
- **Maintainability**: Changes to schema don't affect business logic (and vice versa)

### Why Lazy Context Chain Assembly?
- **Consistency**: Always computed from current state (no stale data)
- **Simplicity**: No denormalization logic needed
- **Flexibility**: Easy to change inheritance rules without migrations
- **Performance**: Only computed when requested (most operations don't need full context)

---

## Complexity Hotspots

### High Complexity (>500 LOC)
1. **task_service.rs** (582 lines): Cycle detection, depth validation, context assembly
2. **jj.rs** (506 lines): jj-lib API wrappers, commit workflow, rebase handling

### Medium Complexity (200-500 LOC)
3. **task_repo.rs** (300 lines): SQL queries with dynamic filtering
4. **git.rs** (250+ lines): gix API + CLI fallback hybrid

### Low Complexity (<200 LOC)
5. **context.rs** (124 lines): Ancestor chain traversal
6. **executor.ts** (86 lines): VM sandbox setup
7. **detection.rs** (79 lines): VCS type detection
8. **schema.rs** (71 lines): Schema definition + migration
9. **cli.ts** (68 lines): Subprocess orchestration

---

## Extension Points

### Adding New Command
1. Define in `commands/<domain>.rs`:
   ```rust
   #[derive(Subcommand)]
   pub enum FooCommand { Bar { ... } }
   
   pub fn handle(conn: &Connection, cmd: FooCommand) -> Result<FooResult> { ... }
   ```
2. Wire in `commands/mod.rs`:
   ```rust
   pub use foo::{FooCommand, FooResult};
   ```
3. Add to `main.rs` CLI enum + `run()` function
4. Expose in MCP API (`mcp/src/api/foo.ts`)
5. Export from `mcp/src/api/index.ts`

### Adding New VCS Backend
1. Implement `VcsBackend` trait in `vcs/<name>.rs`
2. Add variant to `VcsType` enum
3. Update `detection::detect_vcs_type()` to recognize backend (check for `.name/` directory)
4. Update `vcs::get_backend()` factory function
5. Add test in `tests/vcs_integration_test.rs`

### Adding New Task Field
1. Add column to `schema.rs` (with migration logic)
2. Update `Task` type in `types.rs`
3. Update `row_to_task()` in `task_repo.rs` (SQL → Rust)
4. Update `create_task()` / `update_task()` if mutable
5. Update TypeScript types in `mcp/src/types.ts`
6. Update `CreateTaskInput` / `UpdateTaskInput` if settable

### Adding New MCP API
1. Create `mcp/src/api/<domain>.ts`
2. Implement functions that call `callCli()`
3. Export from `mcp/src/api/index.ts`
4. Add to sandbox in `mcp/src/executor.ts`

---

## Summary Statistics

- **Total LOC**: ~6,000
  - Rust: ~4,500 (75%)
  - TypeScript: ~1,500 (25%)
- **Core Abstractions**: 5
  - TaskId/LearningId (newtypes)
  - Task/Learning (domain types)
  - VcsBackend (trait)
  - TaskService (business logic)
  - Repository layer (SQL)
- **Command Handlers**: 16
  - Task: 13 (create, get, list, update, delete, start, complete, reopen, block, unblock, next-ready, tree, search)
  - Learning: 3 (add, list, delete)
  - VCS: 5 (detect, status, log, diff, commit)
  - Data: 2 (export, import)
- **Database Tables**: 3 (tasks, learnings, task_blockers)
- **VCS Backends**: 2 (JjBackend, GixBackend)
- **Test Files**: 6 (3 Rust integration, 3 TypeScript unit)
- **MCP APIs**: 3 (tasks, learnings, vcs)

---

## Unresolved Questions

1. **Scalability**: How does SQLite perform with 10k+ tasks? Need benchmarks.
2. **Concurrent Writes**: WAL mode allows concurrent reads, but writes still serialize. Impact on multi-agent workflows?
3. **VCS Commit SHA Reliability**: What if multiple commits happen between task start/complete?
4. **Search Implementation**: `task search` command exists but implementation details unclear (likely FTS5).
5. **API Versioning**: How to handle breaking changes in CLI JSON output? Need versioning strategy.
6. **Cross-Task Learnings**: `source_task_id` field exists but not exposed in MCP API. Future feature?
7. **Task Priorities**: 1-5 scale, but no enforcement of what each level means. Need documentation?
8. **Error Recovery**: What happens if agent code throws in VM? (Currently caught and returned as `ExecutionError`)

---

## Conclusion

Overseer demonstrates a clean separation of concerns across three layers:

1. **Persistence** (SQLite): Schema, constraints, queries
2. **Business Logic** (Rust): Validation, cycles, context assembly
3. **Agent Interface** (Node MCP): Codemode pattern with high-level APIs

Key innovations:
- **Codemode pattern** for LLM-friendly composable operations
- **Native VCS integration** (jj-lib) for agent-first workflows
- **Computed context chains** for consistent inheritance without denormalization
- **Type-safe IDs** (prefixed ULIDs) for coordination-free generation

The architecture is extensible (trait-based VCS, modular commands), well-tested (unit + integration), and production-ready (proper error handling, transaction support, concurrent reads).
