# Manual MCP Integration Test

## Prerequisites

1. Build the Rust CLI:
   ```bash
   cd ../os && cargo build --release
   ```

2. Ensure `os` is in PATH or create symlink:
   ```bash
   ln -s $(pwd)/../os/target/release/os /usr/local/bin/os
   ```

3. Build MCP server:
   ```bash
   npm run build
   ```

## Test 1: Start Server

```bash
node build/index.js
```

Expected: Server starts, logs "Overseer MCP server running on stdio"

## Test 2: Execute Simple Code (via MCP client)

Using an MCP client, call the `execute` tool:

```json
{
  "name": "execute",
  "arguments": {
    "code": "return await tasks.list();"
  }
}
```

Expected: Returns empty array `[]` (no tasks yet)

## Test 3: Create and Retrieve Task

```javascript
const milestone = await tasks.create({
  description: "Test milestone",
  context: "Testing MCP integration",
  priority: 1
});

return await tasks.get(milestone.id);
```

Expected: Returns task object with:
- `depth: 0`
- `context.own: "Testing MCP integration"`
- `learnings.milestone: []`

## Test 4: VCS Detection

```javascript
return await vcs.detect();
```

Expected: Returns `{ type: "jj" | "git" | "none", root: "..." }`

## Test 5: Error Handling

```javascript
return await tasks.get("invalid-id");
```

Expected: CLI error in response

## Test 6: Progressive Context

```javascript
const m = await tasks.create({
  description: "Milestone",
  context: "Root context"
});

const t = await tasks.create({
  description: "Task",
  parentId: m.id,
  context: "Task context"
});

const s = await tasks.create({
  description: "Subtask",
  parentId: t.id,
  context: "Subtask context"
});

return await tasks.get(s.id);
```

Expected: Returns subtask with:
```json
{
  "context": {
    "own": "Subtask context",
    "parent": "Task context",
    "milestone": "Root context"
  }
}
```
