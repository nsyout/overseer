# VCS MODULE

Git-only VCS backend via gix (with git CLI fallback for commit paths).

## FILES

| File | Lines | Purpose |
|------|-------|---------|
| `mod.rs` | - | Public API: `get_backend()`, `detect()`, re-exports |
| `backend.rs` | - | `VcsBackend` trait, error types, data structs |
| `detection.rs` | - | `detect_vcs_type()`: walks up dirs looking for `.git/` |
| `git.rs` | ~730 | `GixBackend`: gix for read ops, git CLI for commits |

## KEY OPERATIONS

- `status()`: Working copy status (modified, added, deleted files)
- `log()`: Commit history with commit IDs
- `commit()`: Snapshot working copy changes
- `create_bookmark()` / `delete_bookmark()`: Branch/bookmark management
- `checkout()`: Switch working copy to target
- `current_commit_id()`: Get HEAD commit ID
- `list_bookmarks()`: List branches/bookmarks with optional prefix filter

## STACKING SEMANTICS

Workflow behavior:
- **start**: Create bookmark/branch at HEAD, checkout
- **complete**: Commit -> checkout start_commit -> delete bookmark/branch
- Solves git's "cannot delete checked-out branch" error

## CONVENTIONS

- **git detection**: checks `.git/` while walking up parent directories
- **gix commit fallback**: uses git CLI for `commit()` because gix staging API is unstable
- **timestamps**: `chrono::DateTime<Utc>` for log entries

## ANTI-PATTERNS

- Never guess VCS type - always detect via `detection.rs`
- Never assume a repo exists - propagate `NotARepository`
- Never skip checkout-before-delete in workflow cleanup
