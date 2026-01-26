# DB LAYER

**OVERVIEW:** SQLite persistence with foreign key enforcement, CASCADE deletes, prefixed ID constraints

## FILES

| File | Purpose | Lines |
|------|---------|-------|
| `schema.rs` | DDL, connection mgmt, FK enforcement | 71 |
| `task_repo.rs` | Task CRUD, blockers, hierarchy queries | 300 |
| `learning_repo.rs` | Learning CRUD, task association | 252 |
| `mod.rs` | Public API re-exports | 12 |

## SCHEMA

```sql
-- Core tables with CHECK constraints on prefixed IDs
tasks (
  id TEXT PRIMARY KEY CHECK (id LIKE 'task_%'),
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE CHECK (parent_id LIKE 'task_%'),
  description, context, result, priority, completed,
  completed_at, created_at, updated_at, commit_sha, started_at
)

learnings (
  id TEXT PRIMARY KEY CHECK (id LIKE 'lrn_%'),
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE CHECK (task_id LIKE 'task_%'),
  content, source_task_id, created_at
)

task_blockers (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE CHECK (task_id LIKE 'task_%'),
  blocker_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE CHECK (blocker_id LIKE 'task_%'),
  PRIMARY KEY (task_id, blocker_id)
)

task_metadata (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  data TEXT NOT NULL
)

-- Indexes
idx_tasks_parent, idx_tasks_completed, idx_learnings_task, idx_blockers_blocker
```

## PATTERNS

**Initialization (schema.rs:62-70)**
- `PRAGMA foreign_keys = ON;` enforced on every connection
- `PRAGMA journal_mode = WAL;` for concurrent reads
- Schema versioning via `user_version` pragma

**CASCADE delete invariant**
- Deleting task → removes children (parent_id FK), learnings (task_id FK), blockers (both FKs)
- Test: learning_repo.rs:231-250 validates cascade behavior

**ID constraints**
- All IDs prefixed: `task_*`, `lrn_*`
- CHECK constraints enforce prefixes at DB layer
- Generated via ULID (src/id.rs)

**Row mapping**
- `row_to_task()`: Deserializes SQLite → domain type
- Timestamps: RFC3339 string ↔ DateTime<Utc>
- Boolean: i32 (0/1) ↔ bool

**Dynamic queries (task_repo.rs:114-146)**
- Build SQL + params vector for filtering
- `Box<dyn ToSql>` for heterogeneous params
- Order: priority ASC, created_at ASC

**Blocker resolution**
- `get_blockers()`: task → upstream blockers
- `get_blocking()`: task → downstream blocked tasks
- Junction table: task_blockers

**Depth calculation (task_repo.rs:267-290)**
- Walk parent_id chain until NULL
- No recursion - iterative loop
- Used for 3-level hierarchy enforcement (validation in core/task_service.rs)

**Ready filter (task_repo.rs:141-143)**
- Task is ready if: not completed AND all blockers completed
- `is_completed()` helper checks blocker status
