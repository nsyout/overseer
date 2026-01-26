# VCS MODULE

Native VCS backends: jj-lib (primary), gix (fallback). No subprocess spawning for read ops.

## FILES

| File | Purpose |
|------|---------|
| `mod.rs` | Public API: `get_backend()`, `detect()`, re-exports |
| `backend.rs` | `VcsBackend` trait, error types, data structs |
| `detection.rs` | `detect_vcs_type()`: walks up dirs, `.jj/` before `.git/` |
| `jj.rs` | `JjBackend`: jj-lib native, sync via pollster |
| `git.rs` | `GixBackend`: gix for read ops, git CLI for commits |

## CONVENTIONS

- **jj-first**: Detection checks `.jj/` before `.git/` (line 9-10 in detection.rs)
- **jj-lib pinned**: `=0.37` exact version - API breaks between minors
- **Workspace reload**: `JjBackend` reloads workspace per operation (no stale state)
- **gix commit fallback**: Uses git CLI for `commit()` - gix staging API unstable
- **Change ID format**: jj uses reverse-hex encoded change IDs, truncated to 8-12 chars
- **Timestamps**: `chrono::DateTime<Utc>` for all log entries

## ANTI-PATTERNS

- Never cache `Workspace`/`ReadonlyRepo` - reload each operation
- Never assume git CLI available in jj backend - use jj-lib only
- Never skip `rebase_descendants()` after `rewrite_commit()` in jj
- Never use async directly - jj-lib async blocked on pollster where needed
- Never check `.git/` first - jj repos can have both, jj takes precedence
