# CORE BUSINESS LOGIC

**Business logic layer - orchestrates task operations, validation, context assembly, learning inheritance.**

## FILES

| File | Purpose | Key Responsibilities |
|------|---------|---------------------|
| `mod.rs` | Module exports | TaskService, WorkflowService, context API |
| `task_service.rs` | Task orchestration | CRUD validation, cycle detection, depth enforcement |
| `workflow_service.rs` | Task lifecycle | start/complete with VCS bookmarks, commit squashing |
| `context.rs` | Context assembly | Ancestor chain traversal, progressive context building, learning aggregation |

## KEY ALGORITHMS

### DFS Cycle Detection (task_service.rs:267-301)

**Parent cycles**: Linear traversal up parent chain until loop detected or end reached.
```rust
current → parent → parent.parent → ... → task_id? (cycle!)
```

**Blocker cycles**: DFS with visited set to detect transitive blocker dependencies.
```rust
new_blocker → its blockers → their blockers → ... → task_id? (cycle!)
```
- Uses HashSet for O(1) visited check
- Stack-based iteration (no recursion)
- Early termination on cycle found

### Context Chain Assembly (task_service.rs:168-217, context.rs:57-83)

**Depth-based context inheritance**:
- **Depth 0** (Milestone): own only
- **Depth 1** (Task): own + milestone (parent)
- **Depth 2** (Subtask): own + parent + milestone (grandparent)

**Two implementations**:
1. `TaskService::assemble_context_chain`: Depth-first, inline DB access
2. `context::build_progressive_context`: Ancestor chain traversal (more flexible)

### Learnings Bubbling (workflow_service.rs)

**Learnings are added during task completion** and bubble to immediate parent:
- When completing a task with learnings, they are attached to the task
- Learnings also bubble (copy) to the immediate parent task only
- `source_task_id` is preserved through bubbling (A1 → A → M keeps origin = A1)
- Siblings see learnings only after code has merged to their common ancestor

**Pattern**: Own learnings returned in `get()`. No separate add/delete operations.

## PATTERNS

### Service Layer
- Single `TaskService` struct wraps all business logic
- DB connection passed by reference (&Connection)
- No direct DB access outside service/repos
- All ops return `Result<T, OsError>`

### Validation Order
1. Existence checks (parent, blockers)
2. Cycle detection (more specific error)
3. Depth limit enforcement
4. DB mutation

### Depth Calculation
- Not stored in DB, computed on demand
- Added to Task in service layer before return
- Recursive parent traversal: `depth = parent_depth + 1`

### VCS Integration (workflow_service.rs)
- `start()`: Creates VCS bookmark named after task
- `complete_with_learnings()`: Squashes commits, captures commit SHA, adds learnings, bubbles to parent
- Graceful degradation if no VCS available
- VCS errors logged but never block task operations
- Milestone completion: cleans up child bookmarks

### Context Assembly
- Lazy: only built when task retrieved via `get()`
- Not computed for `list()` operations (perf)
- Empty strings filtered out (context.rs:80-81)

## INVARIANTS

1. MAX_DEPTH = 2 (3 levels: 0, 1, 2)
2. Cycle detection BEFORE depth check
3. Depth always recomputed, never trusted from DB
4. Context chain matches depth semantics exactly
5. Learnings bubble to immediate parent only on completion (preserves source_task_id)
6. VCS ops are best-effort, never fail task state transitions
7. Task state updated BEFORE VCS ops (workflow_service.rs)
