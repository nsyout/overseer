# Plan: VCS Mandatory for Workflow Ops

**Issue:** https://github.com/dmmulroy/overseer/issues/2  
**Date:** 2026-01-30

## Summary

Make VCS mandatory for `start`/`complete` operations. CRUD ops remain VCS-agnostic. VCS failures become real errors (not best-effort warnings).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| VCS scope | Workflow ops only | CRUD works anywhere; workflow needs VCS |
| Error handling | VCS-first, then DB | Prevents partial state on failure |
| `task delete` cleanup | Best-effort | Don't block delete on VCS state |
| Git squash | Skip, use `commit()` | Current impl has edge cases; defer fix |
| Re-checkout on started | Yes | Enables recovery from partial state |
| WIP commit on start | Remove | Unnecessary error surface |
| Auto-init repo | No | Too surprising; user runs `jj/git init` |

## Error Semantics

| VcsError | Behavior | Notes |
|----------|----------|-------|
| `NotARepository` | Error | Hint: run `jj init` or `git init` |
| `NoWorkingCopy` | Error | Precondition failure |
| `DirtyWorkingCopy` | Error | User must commit/stash first |
| `BookmarkExists` | Success | Idempotent create |
| `BookmarkNotFound` (delete) | Success | Idempotent delete |
| `NothingToCommit` | Success | Normal for complete |
| `RebaseConflict` | Error | Requires manual resolution |

## Implementation Tasks

### 1. Update `WorkflowService` - remove Option wrapper

**File:** `overseer/src/core/workflow_service.rs`

```rust
// Before
pub struct TaskWorkflowService<'a> {
    task_service: TaskService<'a>,
    vcs: Option<Box<dyn VcsBackend>>,
    conn: &'a Connection,
}

// After
pub struct TaskWorkflowService<'a> {
    task_service: TaskService<'a>,
    vcs: Box<dyn VcsBackend>,
    conn: &'a Connection,
}
```

Update `new()` signature accordingly.

### 2. Rewrite `start()` - VCS-first ordering

**File:** `overseer/src/core/workflow_service.rs`

```rust
pub fn start(&self, id: &TaskId) -> Result<Task> {
    let task = self.task_service.get(id)?;
    let bookmark = task.bookmark.clone()
        .unwrap_or_else(|| format!("task/{}", id));

    // 1. Ensure bookmark exists (idempotent)
    match self.vcs.create_bookmark(&bookmark, None) {
        Ok(()) | Err(VcsError::BookmarkExists(_)) => {}
        Err(e) => return Err(e.into()),
    }

    // 2. Checkout (can fail on DirtyWorkingCopy)
    self.vcs.checkout(&bookmark)?;

    // 3. Record start commit
    let sha = self.vcs.current_commit_id()?;

    // 4. DB updates (after VCS succeeds)
    task_repo::set_bookmark(self.conn, id, &bookmark)?;
    task_repo::set_start_commit(self.conn, id, &sha)?;

    if task.started_at.is_none() {
        self.task_service.start(id)?;
    }

    self.task_service.get(id)
}
```

Remove WIP commit entirely.

### 3. Rewrite `complete*()` - VCS-first ordering

**File:** `overseer/src/core/workflow_service.rs`

For completion:
1. Ensure on correct bookmark (checkout if needed)
2. VCS finalize: `commit()` only (skip `squash()` for now)
3. Get commit SHA
4. DB complete + bubble learnings

Handle `NothingToCommit` as success.

### 4. Keep `delete` cleanup best-effort

**File:** `overseer/src/core/workflow_service.rs` (if delete has VCS cleanup)

Bookmark deletion on task delete remains warn-only.

### 5. Add VcsError -> OsError conversion

**File:** `overseer/src/error.rs`

Ensure `VcsError` variants convert to `OsError` properly:

```rust
#[derive(Debug, thiserror::Error)]
pub enum OsError {
    // ... existing variants
    #[error("VCS error: {0}")]
    Vcs(#[from] VcsError),
    
    #[error("not in a repository - run `jj init` or `git init`")]
    NotARepository,
    
    #[error("working copy has uncommitted changes - commit or stash first")]
    DirtyWorkingCopy,
}
```

### 6. Update CLI - detect VCS only for workflow commands

**File:** `overseer/src/main.rs` or `overseer/src/commands/task.rs`

```rust
// Only require VCS for start/complete
match &cmd {
    TaskCommand::Start { .. } | TaskCommand::Complete { .. } => {
        let vcs = vcs::get_backend(&db_path)?; // Error if not in repo
        let workflow = TaskWorkflowService::new(&conn, vcs);
        // ...
    }
    _ => {
        // CRUD ops - no VCS needed
        let service = TaskService::new(&conn);
        // ...
    }
}
```

### 7. Update tests

**File:** `overseer/src/core/workflow_service.rs` (tests module)

Tests currently pass `None` for VCS. Update to use real repos:

```rust
#[test]
fn test_start_with_vcs() {
    let repo = GitTestRepo::new().unwrap();
    let conn = open_test_db();
    let vcs = repo.backend_boxed().unwrap();
    let workflow = TaskWorkflowService::new(&conn, vcs);
    // ...
}
```

### 8. Update MCP docs/comments

**File:** `mcp/src/api/tasks.ts`

Remove "if VCS available" wording. Document that `start`/`complete` require being in a VCS repo.

## Task Checklist

- [ ] 1. Remove `Option` from `WorkflowService.vcs`
- [ ] 2. Rewrite `start()` with VCS-first ordering
- [ ] 3. Rewrite `complete*()` with VCS-first ordering  
- [ ] 4. Verify delete cleanup is best-effort
- [ ] 5. Add/update VcsError -> OsError conversions
- [ ] 6. Update CLI to detect VCS only for workflow commands
- [ ] 7. Update workflow_service tests to use real repos
- [ ] 8. Update MCP docs

## Out of Scope

- Git squash semantics fix (defer to separate PR)
- `os vcs init` command (future enhancement)
- Structured warnings in JSON output (future enhancement)

## Risks

| Risk | Mitigation |
|------|------------|
| Tests break (pass None for VCS) | Update to use testutil repos |
| Users surprised by errors | Clear error messages with hints |
| Partial state on VCS error | VCS-first ordering prevents this |

## Unresolved Questions

None - all decisions made.
