# Overseer v1.0.0 Task Tracker

## Summary

| Status | Count |
|--------|-------|
| ✅ Completed | 32 |
| 🔄 Open | 1 |
| **Total** | **33** |

---

## Completed Tasks

### Test Infrastructure (Task 33 subtasks)

- [x] **#34** Create testutil module with TestRepo trait
- [x] **#35** Implement JjTestRepo
- [x] **#36** Implement GitTestRepo
- [x] **#37** Add comprehensive JJ integration tests
- [x] **#38** Migrate existing jj.rs tests to testutil
- [x] **#33** Build integration test infrastructure for VCS

### Phase 2: Progressive Context (Task 39 subtasks)

- [x] **#42** Implement context chain assembly in task get
- [x] **#43** Add inherited learnings to task get
- [x] **#39** Phase 2: Progressive Context

### Phase 5: Node MCP Server (Task 41 subtasks)

- [x] **#52** Scaffold MCP Node.js project
- [x] **#53** Implement CLI bridge executor
- [x] **#54** Create tasks API wrapper
- [x] **#55** Create learnings API wrapper
- [x] **#56** Create vcs API wrapper
- [x] **#57** Implement VM sandbox executor
- [x] **#58** Register execute tool with MCP
- [x] **#59** Add MCP integration tests
- [x] **#41** Phase 5: Node MCP Server

### Phase 4: Git Backend (Task 40 subtasks)

- [x] **#44** Add gix dependency to Cargo.toml
- [x] **#45** Implement GixBackend struct
- [x] **#46** Implement git status operation
- [x] **#47** Implement git log operation
- [x] **#48** Implement git diff operation
- [x] **#49** Implement git commit operation
- [x] **#50** Wire up GixBackend in get_backend()
- [x] **#51** Add git integration tests
- [x] **#40** Phase 4: Git Backend with gix

### Additional Features

- [x] **#60** Auto-populate commit_sha on task complete
- [x] **#61** Add CLI commands: next-ready, tree, search
- [x] **#63** Add unit tests for TaskService
- [x] **#64** Add unit tests for LearningService
- [x] **#65** Documentation and README

---

## Open Tasks by Phase

### Test Infrastructure (#33) ✅

> Create shared test fixtures and helpers for creating real jj and git repos.

| ID | Task | Status | Blocked By |
|----|------|--------|------------|
| 33 | Build integration test infrastructure for VCS | ✅ completed | - |
| 37 | Add comprehensive JJ integration tests | ✅ completed | #35 ✅ |
| 38 | Migrate existing jj.rs tests to testutil | ✅ completed | #35 ✅ |

---

### Phase 2: Progressive Context (#39) ✅

> Implement progressive context disclosure - when fetching a subtask, response includes ancestor context + learnings.

| ID | Task | Status | Blocked By |
|----|------|--------|------------|
| 39 | Phase 2: Progressive Context | ✅ completed | - |
| 42 | Implement context chain assembly in task get | ✅ completed | - |
| 43 | Add inherited learnings to task get | ✅ completed | #42 ✅ |

---

### Phase 4: Git Backend with gix (#40) ✅

> Implement GixBackend for git repositories as fallback for non-jj repos.

| ID | Task | Status | Blocked By |
|----|------|--------|------------|
| 40 | Phase 4: Git Backend with gix | ✅ completed | - |
| 44 | Add gix dependency to Cargo.toml | ✅ completed | - |
| 45 | Implement GixBackend struct | ✅ completed | #44 ✅ |
| 46 | Implement git status operation | ✅ completed | #45 ✅ |
| 47 | Implement git log operation | ✅ completed | #45 ✅ |
| 48 | Implement git diff operation | ✅ completed | #45 ✅ |
| 49 | Implement git commit operation | ✅ completed | #45 ✅ |
| 50 | Wire up GixBackend in get_backend() | ✅ completed | #46 ✅, #47 ✅, #48 ✅ |
| 51 | Add git integration tests | ✅ completed | #33 ✅, #50 ✅ |

---

### Phase 5: Node MCP Server (#41) ✅

> Create the Node.js MCP wrapper with codemode pattern - single "execute" tool, VM sandbox, CLI bridge.

| ID | Task | Status | Blocked By |
|----|------|--------|------------|
| 41 | Phase 5: Node MCP Server | ✅ completed | - |
| 52 | Scaffold MCP Node.js project | ✅ completed | - |
| 53 | Implement CLI bridge executor | ✅ completed | #52 ✅ |
| 54 | Create tasks API wrapper | ✅ completed | #53 ✅ |
| 55 | Create learnings API wrapper | ✅ completed | #53 ✅ |
| 56 | Create vcs API wrapper | ✅ completed | #53 ✅ |
| 57 | Implement VM sandbox executor | ✅ completed | #54 ✅, #55 ✅, #56 ✅ |
| 58 | Register execute tool with MCP | ✅ completed | #57 ✅ |
| 59 | Add MCP integration tests | ✅ completed | #58 ✅ |

---

### Additional Features

| ID | Task | Status | Blocked By |
|----|------|--------|------------|
| 60 | Auto-populate commit_sha on task complete | ✅ completed | - |
| 61 | Add CLI commands: next-ready, tree, search | ✅ completed | - |
| 62 | Add export/import commands | 🔄 open | - |

---

### Testing

| ID | Task | Status | Blocked By |
|----|------|--------|------------|
| 63 | Add unit tests for TaskService | ✅ completed | - |
| 64 | Add unit tests for LearningService | ✅ completed | - |

---

### Documentation

| ID | Task | Status | Blocked By |
|----|------|--------|------------|
| 65 | Documentation and README | ✅ completed | #33 ✅, #39 ✅, #40 ✅, #41 ✅ |

---

## Dependency Graph

```
                    ┌──────────────────────────────────────────────────────────────┐
                    │                     DOCUMENTATION (#65)                       │
                    └──────────────────────────────────────────────────────────────┘
                                    ▲           ▲           ▲           ▲
                    ┌───────────────┴───────────┴───────────┴───────────┴───────────┐
                    │                                                               │
    ┌───────────────┴───────────────┐   ┌───────────────────────────┐   ┌───────────┴───────────┐
    │   TEST INFRASTRUCTURE (#33)   │   │  PROGRESSIVE CONTEXT (#39) │   │   GIT BACKEND (#40)   │
    └───────────────────────────────┘   └───────────────────────────┘   └───────────────────────┘
                    │                               │                               │
         ┌──────────┴──────────┐           ┌────────┴────────┐           ┌──────────┴──────────┐
         ▼                     ▼           ▼                 ▼           ▼                     │
    ┌─────────┐           ┌─────────┐  ┌─────────┐      ┌─────────┐  ┌─────────┐               │
    │  #37    │           │  #38    │  │  #42    │ ──▶  │  #43    │  │  #44    │               │
    │ JJ Tests│           │ Migrate │  │ Context │      │Learnings│  │  gix    │               │
    └─────────┘           └─────────┘  └─────────┘      └─────────┘  └────┬────┘               │
         ▲                     ▲                                          │                     │
         │                     │                                          ▼                     │
    ┌────┴────┐           ┌────┴────┐                               ┌─────────┐               │
    │  #35 ✅ │           │  #35 ✅ │                               │  #45    │               │
    │JjTestRep│           │JjTestRep│                               │GixBacknd│               │
    └────┬────┘           └─────────┘                               └────┬────┘               │
         │                                                    ┌──────────┼──────────┐         │
         ▼                                                    ▼          ▼          ▼         │
    ┌─────────┐                                          ┌─────────┐┌─────────┐┌─────────┐    │
    │  #34 ✅ │                                          │  #46    ││  #47    ││  #48    │    │
    │TestRepo │                                          │ status  ││  log    ││  diff   │    │
    └─────────┘                                          └────┬────┘└────┬────┘└────┬────┘    │
                                                              │          │          │         │
                                                              └──────────┼──────────┘         │
                                                                         ▼                    │
                                                                    ┌─────────┐               │
                                                                    │  #50    │               │
                                                                    │ Wire up │               │
                                                                    └────┬────┘               │
                                                                         │                    │
                                                                         ▼                    │
                                                                    ┌─────────┐               │
                                                                    │  #51    │◀──────────────┘
                                                                    │Git Tests│
                                                                    └─────────┘

    ┌───────────────────────────────────────────────────────────────────────────────────────────┐
    │                              NODE MCP SERVER (#41)                                        │
    └───────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
                                       ┌─────────┐
                                       │  #52    │
                                       │Scaffold │
                                       └────┬────┘
                                            │
                                            ▼
                                       ┌─────────┐
                                       │  #53    │
                                       │Executor │
                                       └────┬────┘
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                         ┌─────────┐   ┌─────────┐   ┌─────────┐
                         │  #54    │   │  #55    │   │  #56    │
                         │ tasks   │   │learnings│   │  vcs    │
                         └────┬────┘   └────┬────┘   └────┬────┘
                              │             │             │
                              └─────────────┼─────────────┘
                                            ▼
                                       ┌─────────┐
                                       │  #57    │
                                       │ Sandbox │
                                       └────┬────┘
                                            │
                                            ▼
                                       ┌─────────┐
                                       │  #58    │
                                       │  Tool   │
                                       └────┬────┘
                                            │
                                            ▼
                                       ┌─────────┐
                                       │  #59    │
                                       │MCP Tests│
                                       └─────────┘
```

---

## Ready to Start (No Blockers)

These tasks can be started immediately:

| ID | Task | Phase |
|----|------|-------|
| 62 | Add export/import commands | Features |

---

## Task Details

### #33 - Build integration test infrastructure for VCS
Create shared test fixtures and helpers for creating real jj and git repos. Structure:
- os/src/testutil.rs - Test utilities module (cfg(test))
- TestRepo trait with common operations
- JjTestRepo and GitTestRepo implementations
- Helpers: create_file, write_file, commit, etc.
- Migrate existing jj.rs tests to use new infra
- Add comprehensive integration tests for all VCS operations

### #37 - Add comprehensive JJ integration tests
Add tests for:
- status with modified/added/deleted files
- log with multiple commits
- diff with various change types
- commit workflow (create file, describe, new)
- current_commit_id changes after commit

### #38 - Migrate existing jj.rs tests to testutil
Refactor existing tests in jj.rs to use JjTestRepo from testutil module instead of inline init_jj_repo helper

### #42 - Implement context chain assembly in task get
When fetching a task, assemble context from ancestors:
- own: task's own context
- parent: parent task's context (if depth > 0)
- milestone: root milestone's context (if depth > 1)
Return structured context object in JSON output.

### #43 - Add inherited learnings to task get
Include learnings from ancestors in task get response:
- milestone: learnings attached to root milestone
- parent: learnings attached to parent task
Structure as { milestone: Learning[], parent: Learning[] }

### #44 - Add gix dependency to Cargo.toml
Add gix with appropriate feature flags:
```toml
gix = { version = "0.72", default-features = false, features = ["index", "worktree-mutation", "status", "revision", "dirwalk"] }
```
Add profile optimization for dev builds.

### #45 - Implement GixBackend struct
Create os/src/vcs/git.rs with GixBackend implementing VcsBackend trait:
- open() to load repository
- Implement vcs_type(), root(), current_commit_id()

### #46 - Implement git status operation
Implement status() for GixBackend:
- Use gix status API to get modified/added/deleted files
- Return VcsStatus with file list and HEAD commit id

### #47 - Implement git log operation
Implement log() for GixBackend:
- Walk commit history from HEAD
- Return Vec<LogEntry> with id, description, author, timestamp

### #48 - Implement git diff operation
Implement diff() for GixBackend:
- Compare working tree to HEAD (or specified base)
- Return Vec<DiffEntry> with path and change_type

### #49 - Implement git commit operation
Implement commit() for GixBackend:
- Stage all changes (git add -A equivalent)
- Create commit with message
- Return CommitResult with commit id

### #50 - Wire up GixBackend in get_backend()
Update os/src/vcs/mod.rs get_backend() to return GixBackend for VcsType::Git instead of error.

### #51 - Add git integration tests
Add comprehensive tests for GixBackend using GitTestRepo:
- status with modified/added/deleted files
- log with multiple commits
- diff with various change types
- commit workflow

### #52 - Scaffold MCP Node.js project
Create mcp/ directory with:
- package.json with MCP SDK dependency
- tsconfig.json
- src/index.ts entry point
- Basic MCP server setup with stdio transport

### #53 - Implement CLI bridge executor
Create src/executor.ts:
- callCli() function that spawns os CLI with --json flag
- 30s timeout handling
- JSON parsing of stdout
- Error handling for non-zero exit codes

### #54 - Create tasks API wrapper
Create typed wrapper for task CLI commands:
- tasks.list(filter?)
- tasks.get(id)
- tasks.create(input)
- tasks.update(id, input)
- tasks.complete(id, result?)
- tasks.start(id), tasks.reopen(id), tasks.delete(id)
- tasks.block(id, by), tasks.unblock(id, by)

### #55 - Create learnings API wrapper
Create typed wrapper for learning CLI commands:
- learnings.add(taskId, content, source?)
- learnings.list(taskId)
- learnings.delete(id)

### #56 - Create vcs API wrapper
Create typed wrapper for VCS CLI commands:
- vcs.detect()
- vcs.status()
- vcs.log(limit?)
- vcs.diff(base?)
- vcs.commit(message)

### #57 - Implement VM sandbox executor
Create VM sandbox that:
- Runs agent-provided JavaScript code
- Exposes tasks, learnings, vcs APIs in sandbox context
- Handles async/await properly
- Returns execution results

### #58 - Register execute tool with MCP
Register single "execute" tool with:
- Tool description including TypeScript type definitions
- Example usage patterns
- Input schema for code parameter
- Response truncation for large outputs

### #59 - Add MCP integration tests
Test MCP server end-to-end:
- Tool registration
- Execute tool with simple task operations
- Error handling
- Response format

### #60 - Auto-populate commit_sha on task complete
Implement invariant #6: When completing a task, if VCS is available, automatically capture the current commit SHA and store it in commit_sha field. Use current_commit_id() from VcsBackend.

### #61 - Add CLI commands: next-ready, tree, search
Implement remaining task CLI commands from design:
- os task next-ready [--milestone ID] - get next ready task
- os task tree [ID] - display task hierarchy
- os task search "query" - FTS search across tasks

### #62 - Add export/import commands
Implement utility commands:
- os export - dump all tasks as JSON
- os import FILE - import from JSON file

### #63 - Add unit tests for TaskService
Comprehensive unit tests for core/task_service.rs:
- CRUD operations
- Hierarchy enforcement (max depth)
- Blocker cycle detection
- Parent cycle detection
- Pending children check on complete

### #64 - Add unit tests for LearningService
Unit tests for core/learning_service.rs:
- Add/list/delete operations
- Source task reference
- Cascade delete with parent task

### #65 - Documentation and README
Create project documentation:
- README.md with installation, usage examples
- CLI reference documentation
- MCP tool usage guide for agents
- Architecture overview
