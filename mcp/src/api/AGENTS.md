# MCP API LAYER

**OVERVIEW:** VM sandbox APIs wrapping CLI with --json (tasks/learnings/vcs namespaces)

## FILES

| File | Purpose | Key Exports |
|------|---------|-------------|
| `index.ts` | API exports | tasks, learnings, vcs namespaces |
| `tasks.ts` | Task CRUD + state transitions | tasks.{list,get,create,update,start,complete,reopen,delete,block,unblock,nextReady} |
| `learnings.ts` | Learning attachment | learnings.{add,list,delete} |
| `vcs.ts` | VCS abstraction | vcs.{detect,status,log,diff,commit} |

## PATTERNS

### CLI Bridge Pattern
All APIs use `callCli(args)` from `../cli.ts`:

```ts
// cli.ts spawns: os <args> --json
const result = await callCli(["task", "get", id]);
return result as Task;
```

**Key mechanics:**
- Spawn timeout: 30s
- Auto-appends `--json` to all commands
- Parses stdout as JSON
- stderr → CliError on non-zero exit
- Branded IDs (TaskId, LearningId, etc.) passed as strings

### Type Safety
- Input types: `CreateTaskInput`, `UpdateTaskInput`, `TaskFilter`
- Return types: `Task`, `Learning`, `VcsStatus`, etc. (from `../types.ts`)
- Never `any` - all CLI responses cast to domain types
- Filters map to CLI flags: `filter.ready` → `--ready`

### Error Handling
```ts
try {
  await tasks.create(input);
} catch (err) {
  if (err instanceof CliError) {
    // err.code, err.message, err.stderr
  }
}
```

### VCS Abstraction
- `vcs.detect()` returns backend type (jj/git)
- CLI auto-detects via `.jj/` or `.git/`
- `vcs.commit()` handles backend differences:
  - jj: `jj describe -m "..." && jj new`
  - git: `git add -A && git commit -m "..."`

## CONVENTIONS

- All async (CLI spawn overhead)
- Optional args → optional CLI flags
- Arrays serialized: `--blocked-by id1,id2`
- Void returns → discard CLI output
- Null returns → `null` literal in JSON (not undefined)
