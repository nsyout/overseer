# MCP API LAYER

**OVERVIEW:** VM sandbox APIs wrapping CLI with --json (tasks/learnings namespaces)

## FILES

| File | Purpose | Key Exports |
|------|---------|-------------|
| `index.ts` | API exports | tasks, learnings namespaces |
| `tasks.ts` | Task CRUD + lifecycle | tasks.{list,get,create,update,start,complete,reopen,delete,block,unblock,nextReady,tree,search} |
| `learnings.ts` | Learning attachment | learnings.{add,list,delete} |

**Note:** VCS ops integrated into task start/complete - not exposed as separate API.

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

### VCS Integration (Automatic)
- `tasks.start()` → creates VCS bookmark for task
- `tasks.complete()` → squashes commits, captures SHA
- VCS type auto-detected (jj-first, git fallback)
- Agents don't need to manage VCS directly

## CONVENTIONS

- All async (CLI spawn overhead)
- Optional args → optional CLI flags
- Arrays serialized: `--blocked-by id1,id2`
- Void returns → discard CLI output
- Null returns → `null` literal in JSON (not undefined)
