# CORE BUSINESS LOGIC

**Business logic layer - orchestrates task operations, validation, context assembly, learning inheritance.**

## FILES

| File | Purpose | Key Responsibilities |
|------|---------|---------------------|
| `mod.rs` | Module exports | TaskService, context API |
| `task_service.rs` | Task orchestration | CRUD validation, cycle detection, depth enforcement, VCS commit capture |
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

### Inherited Learnings Assembly (task_service.rs:219-265, context.rs:85-112)

**Same depth-based logic as context**:
- Depth 0: empty (milestones don't inherit)
- Depth 1: milestone learnings
- Depth 2: parent + milestone learnings

**Pattern**: Own learnings not included in inheritance - returned separately in `get()`.

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

### VCS Integration
- Auto-populate commit_sha on task completion (task_service.rs:109-122)
- Graceful degradation if no VCS available
- No VCS errors block task operations

### Context Assembly
- Lazy: only built when task retrieved via `get()`
- Not computed for `list()` operations (perf)
- Empty strings filtered out (context.rs:80-81)

## INVARIANTS

1. MAX_DEPTH = 2 (3 levels: 0, 1, 2)
2. Cycle detection BEFORE depth check
3. Depth always recomputed, never trusted from DB
4. Context chain matches depth semantics exactly
5. Learning inheritance mirrors context inheritance
6. VCS commit capture is best-effort, never fails task ops
