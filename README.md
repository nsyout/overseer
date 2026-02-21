# Overseer

Task orchestration for AI agents via MCP. SQLite-backed, native git integration (gix).

## Upstream

This project started as a forked codebase from the original Overseer work by dmmulroy:
- https://github.com/dmmulroy/overseer

## Setup

### Quick start (recommended)

```bash
# 1) Install latest os binary from GitHub Releases (CLI)
just install

# 2) Install/build host + UI deps (needed for MCP/UI)
just setup

# 3) Ensure os is on PATH
export PATH="$HOME/.local/bin:$PATH"
```

What this gives you:
- `os task ...` / `os learning ...` / `os vcs ...` from release binary.
- `os mcp` and `os ui` require local `host` + `ui` build output from this repo.

### Install os from GitHub Releases (manual)

```bash
# Auto-detect OS/arch, verify checksum, install to ~/.local/bin
bash scripts/install.sh

# Verify
~/.local/bin/os --help
```

Note: for private repos, authenticate first (`gh auth login`) so the installer can download release assets.

### Build from source

```bash
# Rust CLI
cd overseer
cargo build --release

# Host (MCP + UI server)
cd ../host
pnpm install
pnpm run build

# UI
cd ../ui
pnpm install
pnpm run build
```

### Via skills.sh (for agents)

```bash
npx skills add nsyout/overseer
```

## Usage

### Who Uses What

- **You (human):** use the CLI (`os task ...`) and UI (`cd ui && pnpm run dev`) to manage and inspect tasks.
- **AI agent:** uses MCP via `host` (`execute` tool with `tasks`/`learnings` APIs).
- **Shared state:** both interfaces read/write the same SQLite task store and follow the same workflow rules.

### Important runtime note

`os` currently shells out to the local Node host for `os mcp` and `os ui`.
That means release binary install alone is not enough for MCP/UI unless the local `host/dist` and `ui/dist` are present.

If you only need CLI task management, release binary install is sufficient.

By default, `os` looks for `host/dist/index.js` and `ui/dist` under your current working directory first, then falls back to paths relative to the binary.
You can override detection with:
- `OVERSEER_HOST_SCRIPT=/absolute/path/to/host/dist/index.js`
- `OVERSEER_UI_DIST=/absolute/path/to/ui/dist`

### MCP Server

Build host first:

```bash
cd host
pnpm install
pnpm run build
```

Then add to your MCP client config:

```json
{
  "mcpServers": {
    "overseer": {
      "command": "node",
      "args": ["/absolute/path/to/overseer/host/dist/index.js", "mcp", "--cli-path", "/Users/you/.local/bin/os", "--cwd", "/absolute/path/to/your/project"]
    }
  }
}
```

Notes:
- Set `--cli-path` to your installed binary (`$HOME/.local/bin/os` if installed via `scripts/install.sh`).
- Set `--cwd` to the project directory where you want tasks/workflow to run.

### CLI

```bash
os task create -d "Implement auth"
os task list --ready
os task start <task-id>
os task complete <task-id>
```

## Architecture

```
┌─────────────────────────────────────┐
│     Overseer MCP (Node.js)          │
│  - Single "execute" tool (codemode) │
│  - VM sandbox with tasks/learnings  │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│         os CLI (Rust)               │
│  - SQLite storage                   │
│  - gix (git backend)                │
└─────────────────────────────────────┘
```

## Codemode Pattern

Single `execute` tool - agents write JS, server runs it:

```javascript
const milestone = await tasks.create({
  description: "User auth system",
  context: "JWT + refresh tokens"
});

const login = await tasks.create({
  description: "Login endpoint",
  parentId: milestone.id
});

await tasks.start(login.id);  // VCS required: creates bookmark, records start commit
// ... do work ...
await tasks.complete(login.id, {  // VCS required: commits changes, bubbles learnings to parent
  result: "Implemented with bcrypt",
  learnings: ["bcrypt rounds should be 12+ for production"]
});

return { milestone, login };
```

## Task Hierarchy

- **Milestone** (depth 0) - Root, no parent
- **Task** (depth 1) - Parent is milestone
- **Subtask** (depth 2) - Max depth, parent is task

## APIs

### tasks

```javascript
tasks.create({ description, context?, parentId?, priority?, blockedBy? })
tasks.get(id)           // Returns TaskWithContext
tasks.list({ parentId?, ready?, completed?, depth?, type? })  // type: "milestone"|"task"|"subtask"
tasks.update(id, { description?, context?, priority?, parentId? })
tasks.start(id)
tasks.complete(id, { result?, learnings? })  // Learnings bubble to immediate parent
tasks.reopen(id)
tasks.delete(id)
tasks.block(taskId, blockerId)
tasks.unblock(taskId, blockerId)
tasks.nextReady(milestoneId?)
tasks.tree(rootId?)     // Returns TaskTree or TaskTree[] (all milestones if no ID)
tasks.search(query)     // Search by description/context/result
tasks.progress(rootId?) // Returns { total, completed, ready, blocked }
```

### learnings

```javascript
learnings.list(taskId)  // Learnings are added via tasks.complete()
```

### VCS (Required for Workflow)

VCS operations are integrated into task workflow - no direct API:

| Operation | VCS Effect |
|-----------|-----------|
| `tasks.start(id)` | **VCS required** - creates bookmark `task/<id>`, records start commit |
| `tasks.complete(id)` | **VCS required** - commits changes, deletes bookmark (best-effort) |
| `tasks.complete(milestone)` | Also cleans ALL descendant bookmarks (depth-1 and depth-2) |
| `tasks.delete(id)` | Best-effort bookmark cleanup (works without VCS) |

VCS (git) is **required** for start/complete. CRUD operations work without VCS.

## Progressive Context

Tasks inherit context from ancestors. Learnings bubble to immediate parent on completion (preserving original `sourceTaskId`):

```javascript
const subtask = await tasks.get(subtaskId);
// subtask.context.own       - This task's context
// subtask.context.parent    - Parent task context (depth > 0)
// subtask.context.milestone - Root milestone context (depth > 1)
// subtask.learnings.own     - This task's learnings (added when completing children)
```

## CLI Reference

```bash
# Tasks
os task create -d "description" [--context "..."] [--parent ID] [--priority 0-2]
os task get <id>
os task list [--parent ID] [--ready] [--completed]
os task update <id> [-d "..."] [--context "..."] [--priority N] [--parent ID]
os task start <id>
os task complete <id> [--result "..."] [--learning "..."]...
os task reopen <id>
os task delete <id>
os task block <id> --by <blocker-id>
os task unblock <id> --by <blocker-id>
os task next-ready [--milestone ID]
os task tree [ID]           # No ID = all milestone trees
os task search "query"
os task progress [ID]       # Aggregate counts: total, completed, ready, blocked

# Learnings (added via task complete --learning)
os learning list <task-id>

# VCS (CLI only - automatic in MCP)
os vcs detect
os vcs status
os vcs log [--limit N]
os vcs diff [BASE_REV]
os vcs commit -m "message"
os vcs cleanup [--delete]  # List/delete orphaned task branches

# Data
os data export [-o file.json]
```

## Task Viewer

Web UI for viewing tasks:

```bash
# Build and run through os (serves UI via host on :6969)
just setup
os ui

# Or run Vite dev UI
cd ui && pnpm run dev  # Opens http://localhost:5173
```

Three views:
- **Graph** - DAG visualization with blocking relationships
- **List** - Filterable task list
- **Kanban** - Board by completion status

Keyboard: `g`=graph, `l`=list, `k`=kanban, `?`=help

## Development

```bash
# Justfile shortcuts
just setup         # host deps + build, ui deps
just install       # install os from latest release
just install-local # build os locally and install to ~/.local/bin
just build         # build os + host + ui
just check         # host/ui production builds
just ui            # run UI dev server

# Rust CLI
cd overseer && cargo build --release
cd overseer && cargo test

# Node Host (MCP + UI server)
cd host && pnpm install
cd host && pnpm run build
cd host && pnpm run typecheck

# UI (dev server)
cd ui && pnpm install && pnpm run dev
```

## Git Hooks (pre-commit)

This repo includes a `.pre-commit-config.yaml` with:
- fast hygiene checks on commit (yaml/json/toml/whitespace/conflicts)
- secret scanning via gitleaks
- heavier host/ui build checks on `pre-push`

Setup:

```bash
pipx install pre-commit  # or: brew install pre-commit
pre-commit install
pre-commit install --hook-type pre-push
```

Run manually:

```bash
pre-commit run --all-files
pre-commit run --hook-stage pre-push --all-files
```

## CI and Security

GitHub Actions workflows in this fork:
- `CI` (`.github/workflows/ci.yml`): Rust fmt/clippy/test + host/ui typecheck/build
- `Security` (`.github/workflows/security.yml`): gitleaks on PRs; cargo-audit and pnpm audit on `main` and weekly schedule
- `CodeQL` (`.github/workflows/codeql.yml`): GitHub code scanning for Rust and JS/TS
- `Release Binaries` (`.github/workflows/release.yml`): manual release workflow that validates state and publishes binaries

## Release Flow

- Prepare release bump locally:

```bash
just prepare-release BUMP=patch
```

- Open PR with version bump and merge to `main`.
- Run `Release Binaries` workflow manually with `version` (e.g. `0.12.1`).

```bash
gh workflow run "Release Binaries" --ref main -f version=0.12.1
```

- Release preflight validates:
  - versions in `overseer/Cargo.toml`, `host/package.json`, and `ui/package.json` match the tag
  - required checks on `main` are green
  - release/tag for that version does not already exist

## Storage

SQLite database location (in priority order):
1. `OVERSEER_DB_PATH` env var (if set)
2. `VCS_ROOT/.overseer/tasks.db` (if in git repo)
3. `$CWD/.overseer/tasks.db` (fallback)

Auto-created on first command.

## VCS Detection

1. Walk up from cwd looking for `.git/` → use gix
2. If not found → `VcsType::None`

## Docs

- [Architecture](docs/ARCHITECTURE.md) - System design, invariants
- [CLI Reference](docs/CLI.md) - Full command documentation
- [MCP Guide](docs/MCP.md) - Agent usage patterns

## License

MIT
