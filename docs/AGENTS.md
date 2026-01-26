# docs/ - Overseer Reference Documentation

Reference docs for system design, CLI commands, and MCP APIs.

## FILES

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | System design, data model, SQL schema, invariants |
| `CLI.md` | Full `os` command reference with examples |
| `MCP.md` | Codemode execute tool, tasks/learnings/vcs APIs |
| `TASKS.md` | Task hierarchy tracker (milestone progress) |
| `task-orchestrator-plan.md` | Original design spec, architecture rationale |
| `codemode-research.md` | Codemode pattern guide (cloudflare-mcp analysis) |
| `codemode-blog.md` | Cloudflare blog post on codemode benefits |
| `mcp-test-results.md` | Test implementation summary, coverage reference |

## WHEN TO USE

| Need | Consult |
|------|---------|
| Data model, schema, types | `ARCHITECTURE.md` |
| CLI command syntax | `CLI.md` |
| MCP APIs (tasks/learnings/vcs) | `MCP.md` |
| Why codemode pattern? | `codemode-blog.md` |
| Codemode implementation details | `codemode-research.md` |
| Original requirements/design | `task-orchestrator-plan.md` |
| Test coverage reference | `mcp-test-results.md` |
| Project milestone status | `TASKS.md` |

## NOTES

- `ARCHITECTURE.md` + `MCP.md` are primary implementation references
- Research docs (`codemode-*`) are background reading, not impl guides
- `TASKS.md` tracks v1.0.0 completion, not ongoing work
