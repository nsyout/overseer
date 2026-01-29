# nextReady Algorithm Implementation Plan

**Created:** 2026-01-28  
**Status:** ✅ COMPLETE (2026-01-29)

## Problem Statement

Current `nextReady` implementation is broken - it uses a flat filter with no hierarchy awareness:

```rust
// Current broken implementation (commands/task.rs:220-244)
let filter = ListTasksFilter {
    parent_id: args.milestone.clone(),
    ready: true,
    completed: None,
};
let tasks = svc.list(&filter)?;
tasks.sort_by(priority desc, created_at asc);
return tasks.first();
```

**Issues:**
- No depth-first traversal
- No start cascade
- No auto-complete bubble-up
- Ignores task hierarchy entirely

## Expected Behavior

### `nextReady(milestone)`
- Depth-first traversal respecting priority order
- Find first incomplete task under milestone
- Recurse into subtasks
- Return deepest incomplete leaf (respecting blockers)
- Milestone with no children returns itself if ready

### `start(milestone)`
- Follow blockers until arriving at a startable task
- Cascade down: start milestone → first task → first subtask
- Return the deepest leaf that was started
- Only error if all paths exhausted or loop detected

### `complete(subtask)`
- After completion, `nextReady` returns sibling subtasks
- Completing final subtask auto-completes parent task
- Completing final task auto-completes milestone
- Stop bubble-up if parent is blocked or has pending children

## Core Algorithm: "Effective Unblocked" Inheritance

A task is **effectively unblocked** iff all blockers on the task AND all its ancestors are completed.

- If milestone is blocked → entire subtree is blocked
- Children completing doesn't unblock a blocked parent
- Children are NOT considered blockers (only explicit `blocked_by` relations)

## Implementation Checklist

### Phase 1: Foundation

#### 1.1 DB Helpers (`overseer/src/db/task_repo.rs`)

```rust
/// List root tasks (milestones) ordered by priority DESC, created_at ASC
pub fn list_roots(conn: &Connection) -> Result<Vec<Task>>

/// Get children ordered by priority DESC, created_at ASC, id ASC
pub fn get_children_ordered(conn: &Connection, parent_id: &TaskId) -> Result<Vec<Task>>

/// Check if task is completed (public helper)
pub fn is_task_completed(conn: &Connection, id: &TaskId) -> Result<bool>
```

#### 1.2 Error Types (`overseer/src/error.rs`)

```rust
#[derive(Error, Debug)]
pub enum OsError {
    // ... existing variants ...

    #[error("{message}")]
    TaskBlocked {
        message: String,
        requested: TaskId,       // what you asked to start
        blocked_at: TaskId,      // where the block occurs  
        blocked_by: Vec<TaskId>, // actionable blockers
        hierarchy_path: Vec<TaskId>,
        blocker_chain: Vec<TaskId>,
    },

    #[error("{message}")]
    BlockerCycle {
        message: String,
        chain: Vec<TaskId>,
    },

    #[error("{message}")]
    NoStartableTask {
        message: String,
        requested: TaskId,
    },

    #[error("{message}")]
    InvalidBlockerRelation {
        message: String,
        task_id: TaskId,
        blocker_id: TaskId,
    },
}
```

### Phase 2: Blocker Validation

#### 2.1 Enhanced Blocker Validation (`overseer/src/core/task_service.rs`)

In `add_blocker()`, reject if blocker is:
- The task itself
- An ancestor of the task
- A descendant of the task

```rust
pub fn add_blocker(&self, task_id: &TaskId, blocker_id: &TaskId) -> Result<Task> {
    // Existing checks...
    
    // NEW: Reject self-block
    if task_id == blocker_id {
        return Err(OsError::InvalidBlockerRelation { ... });
    }
    
    // NEW: Reject ancestor blocker
    if self.is_ancestor(blocker_id, task_id)? {
        return Err(OsError::InvalidBlockerRelation { ... });
    }
    
    // NEW: Reject descendant blocker
    if self.is_descendant(blocker_id, task_id)? {
        return Err(OsError::InvalidBlockerRelation { ... });
    }
    
    // Existing cycle detection...
}
```

#### 2.2 Fix Data Import (`overseer/src/commands/data.rs`)

Replace direct INSERT loop with `TaskService::add_blocker()` calls to enforce validation.

### Phase 3: DFS Selection

#### 3.1 Leaf Enumeration (`overseer/src/core/task_service.rs`)

```rust
/// Collect all incomplete leaf paths under root (includes root if leaf)
/// Returns paths as root->...->leaf
fn collect_incomplete_leaves(&self, root: &Task) -> Result<Vec<Vec<TaskId>>>

/// Find first blockage along leaf->root chain
/// Returns None if leaf is startable (no blockers in chain)
fn first_blockage_along_chain(&self, leaf_path: &[TaskId]) -> Result<Option<Blockage>>

struct Blockage {
    blocked_at: TaskId,
    incomplete_blockers: Vec<TaskId>,
    chain_to_blocked_at: Vec<TaskId>,
}
```

#### 3.2 Start Target Resolver (`overseer/src/core/task_service.rs`)

```rust
/// Resolve which task to actually start given a requested root.
/// Follows blockers until finding a startable task.
pub fn resolve_start_target(&self, requested_root: &TaskId) -> Result<TaskId> {
    // 1. Enumerate incomplete leaves under root
    // 2. For each leaf, check for blockers along chain
    // 3. If blocked, recursively search blocker tasks
    // 4. Return first startable task
    // 5. Error if all paths exhausted or cycle detected
}
```

**Algorithm pseudocode:**

```
resolve_start_target(root):
    blocker_stack = []  // for cycle detection
    
    for leaf_path in collect_incomplete_leaves(root):
        if blockage = first_blockage_along_chain(leaf_path):
            // Blocked - follow blockers
            for blocker in blockage.incomplete_blockers (ordered):
                if blocker in blocker_stack:
                    error BlockerCycle
                blocker_stack.push(blocker)
                if found = resolve_start_target(blocker):
                    return found
                blocker_stack.pop()
        else:
            // Leaf is startable
            return leaf_path.last()
    
    error NoStartableTask
```

#### 3.3 nextReady DFS (`overseer/src/core/task_service.rs`)

```rust
/// Find next ready task (deepest incomplete unblocked leaf)
/// Does NOT follow blockers - just returns None if blocked
pub fn next_ready(&self, milestone: Option<&TaskId>) -> Result<Option<TaskId>> {
    // DFS with ancestors_unblocked=true
    // If node or any ancestor blocked: prune subtree
    // If node incomplete + no incomplete children + unblocked: return it
    // Milestone with no children returns itself if ready
}
```

### Phase 4: Workflow Integration

#### 4.1 Start with Blocker Following (`overseer/src/core/workflow_service.rs`)

```rust
/// Start a task, following blockers to find startable work
pub fn start_follow_blockers(&self, root: &TaskId) -> Result<Task> {
    let target = self.task_service.resolve_start_target(root)?;
    self.start(&target)  // existing VCS-aware start
}
```

#### 4.2 Complete with Bubble-Up (`overseer/src/core/workflow_service.rs`)

```rust
pub fn complete(&self, id: &TaskId, result: Option<&str>) -> Result<Task> {
    let completed_leaf = /* existing complete logic */;
    
    // Bubble up: auto-complete parents
    let mut current_id = id.clone();
    loop {
        let current = task_repo::get_task(conn, &current_id)?;
        let Some(parent_id) = current.parent_id else { break };
        
        if task_repo::has_pending_children(conn, &parent_id)? {
            break;
        }
        
        // Check if parent is blocked
        let parent = task_repo::get_task(conn, &parent_id)?;
        if self.is_effectively_blocked(&parent)? {
            break;
        }
        
        // Auto-complete parent
        if parent.depth == Some(0) {
            self.complete_milestone(&parent_id, None)?;
        } else {
            self.task_service.complete(&parent_id, None)?;
        }
        
        current_id = parent_id;
    }
    
    Ok(completed_leaf)
}
```

### Phase 5: CLI Integration

#### 5.1 New Result Variant (`overseer/src/commands/task.rs`)

```rust
pub enum TaskResult {
    // ... existing variants ...
    MaybeOneWithContext(Option<TaskWithContext>),
}
```

#### 5.2 Wire NextReady (`overseer/src/commands/task.rs`)

```rust
TaskCommand::NextReady(args) => {
    let result = svc.next_ready(args.milestone.as_ref())?;
    match result {
        Some(id) => {
            let task = svc.get(&id)?;
            let with_ctx = get_task_with_context(conn, task)?;
            Ok(TaskResult::MaybeOneWithContext(Some(with_ctx)))
        }
        None => Ok(TaskResult::MaybeOneWithContext(None)),
    }
}
```

#### 5.3 Wire Start (`overseer/src/commands/task.rs`)

```rust
TaskCommand::Start { id } => {
    Ok(TaskResult::One(workflow.start_follow_blockers(&id)?))
}
```

#### 5.4 JSON Serialization (`overseer/src/main.rs`)

```rust
TaskResult::MaybeOneWithContext(opt) => {
    Ok(serde_json::to_string_pretty(&opt)?)  // serializes as null or object
}
```

#### 5.5 Human Output (`overseer/src/main.rs`)

```rust
Command::Task(TaskCommand::NextReady(_)) => {
    if output == "null" {
        println!("No ready tasks found");
    } else {
        // existing task display logic
    }
}
```

### Phase 6: Tests

#### Unit Tests (`overseer/src/core/task_service.rs`)

- [x] `test_next_ready_returns_deepest_leaf`
- [x] `test_next_ready_skips_blocked_subtree`
- [x] `test_next_ready_milestone_as_leaf`
- [x] `test_next_ready_respects_priority_order`
- [x] `test_resolve_start_follows_blockers`
- [x] `test_resolve_start_detects_cycle`
- [x] `test_reject_ancestor_blocker`
- [x] `test_reject_descendant_blocker`

#### Unit Tests (`overseer/src/core/workflow_service.rs`)

- [x] `test_start_cascades_to_deepest_leaf`
- [x] `test_start_follows_blockers_to_startable`
- [x] `test_complete_bubbles_up_to_parent`
- [x] `test_complete_bubbles_up_to_milestone`
- [x] `test_complete_stops_at_blocked_parent`
- [x] `test_complete_stops_at_pending_siblings`

#### MCP Integration Tests (`mcp/src/tests/integration.test.ts`)

- [x] `should return null when no tasks are ready`
- [x] `should return task with context when ready`
- [x] `should return deepest ready leaf in hierarchy`
- [x] `should return task with inherited learnings`
- [x] `should skip blocked subtrees`
- [x] `should handle full task lifecycle`

### Phase 7: Documentation

#### CLI Docs (`docs/CLI.md`)

Update `next-ready` and `start` command descriptions:

```markdown
### next-ready

Find the next task ready to be worked on.

**Behavior:**
- Depth-first search through task hierarchy
- Returns deepest incomplete leaf that is not blocked
- Respects priority ordering (higher priority first)
- Returns milestone itself if it has no children and is unblocked
- Returns null if no ready tasks found

### start

Start working on a task.

**Behavior:**
- If task is blocked, follows blockers to find startable work
- Cascades down to deepest incomplete leaf
- Creates VCS bookmark for the started task
- Errors only if no startable task found after exhausting all paths
```

#### MCP Docs (`mcp/src/server.ts`)

Update tool description for `tasks.start()` and `tasks.nextReady()`.

## File Change Summary

| File | Changes |
|------|---------|
| `overseer/src/db/task_repo.rs` | Add `list_roots`, `get_children_ordered`, `is_task_completed` |
| `overseer/src/error.rs` | Add `TaskBlocked`, `BlockerCycle`, `NoStartableTask`, `InvalidBlockerRelation` |
| `overseer/src/core/task_service.rs` | Add DFS helpers, `next_ready`, `resolve_start_target`, blocker validation |
| `overseer/src/core/workflow_service.rs` | Add `start_follow_blockers`, extend `complete` with bubble-up |
| `overseer/src/commands/task.rs` | Wire new methods, add `MaybeOneWithContext` variant |
| `overseer/src/commands/data.rs` | Use `TaskService::add_blocker` for imports |
| `overseer/src/main.rs` | Handle new result variant, update human output |
| `mcp/src/server.ts` | Update tool descriptions |
| `docs/CLI.md` | Update command documentation |

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Milestone with no children | Return milestone itself if unblocked |
| Blocked milestone with "ready" children | Children not ready (effective-unblocked inheritance) |
| All children complete, parent blocked | Cannot reach via normal workflow; `nextReady` returns parent once unblocked |
| Task A blocks B, B's subtask looks ready | Not ready - ancestor B is blocked, subtree pruned |
| All tasks blocked / empty DB | `nextReady` returns `null`, `start` errors |
| Blocker cycle (shouldn't exist) | Detected during traversal, returns `BlockerCycle` error |

## Ordering Rules

Applied consistently everywhere:
1. `priority DESC` (higher priority first)
2. `created_at ASC` (older first)
3. `id ASC` (stable tie-break)

---

## Implementation Summary

**Completed:** 2026-01-29

### What Was Implemented

1. **DFS nextReady Algorithm** (`task_service.rs`)
   - `next_ready()` - finds deepest unblocked incomplete leaf
   - `resolve_start_target()` - follows blockers to find startable work
   - `is_effectively_blocked()` - checks ancestor chain for blocks

2. **Workflow Integration** (`workflow_service.rs`)
   - `start_follow_blockers()` - starts task via blocker resolution
   - `bubble_up_completion()` - auto-completes parents when all children done
   - VCS integration (bookmarks, commit squashing)

3. **CLI/MCP** 
   - `MaybeOneWithContext` result variant for null-able responses
   - Updated `next-ready` and `start` commands
   - TypeScript types split into `Task` vs `TaskWithContext`

4. **Tests**
   - 16 Rust unit tests (task_service, workflow_service)
   - 6 MCP integration tests for nextReady

### Changes from Original Plan

- **Removed data import** - Export-only now (simpler, avoids blocker validation edge cases)
- **Simplified Blockage struct** - Removed `blocked_at`, `chain_to_blocked_at` fields
- **TaskBlocked error not added** - Using existing error types suffices
- **No separate `is_task_completed` helper** - Using existing `is_completed` closure
