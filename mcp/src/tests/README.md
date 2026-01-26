# MCP Integration Tests

End-to-end and unit tests for the Overseer MCP server.

## Test Structure

```
tests/
├── executor.test.ts      # VM sandbox unit tests
├── server.test.ts        # MCP server tool tests
├── integration.test.ts   # End-to-end with real CLI
└── README.md            # This file
```

## Running Tests

```bash
# Build TypeScript first
npm run build

# Run all tests
npm test

# Run specific test file
node --test build/tests/executor.test.js
```

## Test Coverage

### executor.test.ts (VM Sandbox)
Tests the JavaScript VM sandbox that executes agent code:

- **Basic Execution**: return statements, arithmetic, strings, objects, arrays
- **Async Support**: Promise.resolve, setTimeout, multiple awaits, async functions
- **Variable Scope**: const, let, function declarations
- **Error Handling**: syntax errors, runtime errors, undefined variables
- **Output Truncation**: handles large outputs (50k char limit)
- **Sandbox Isolation**: no access to process, require, global
- **Timeout**: 30s execution limit (skipped in tests - slow)

### server.test.ts (MCP Tool)
Tests the execute tool via the MCP server:

- **Basic Execution**: simple return, async/await, object results
- **Error Handling**: syntax errors, runtime errors

### integration.test.ts (End-to-End)
Tests the full stack with real Rust CLI:

- **Tasks API**: create, get, list, update, complete, reopen, delete, blockers
- **Learnings API**: add, list, delete, inheritance
- **VCS API**: detect, status, log, diff, commit
- **Error Handling**: nonexistent IDs, cycle detection, depth limits
- **Complex Workflows**: full task lifecycle

## Configuration

Integration tests use environment variables:

- `OVERSEER_DB_PATH` - Path to SQLite database
- `OVERSEER_CLI_PATH` - Path to `os` binary (default: `os` in PATH)
- `OVERSEER_CLI_CWD` - Working directory for CLI execution

Tests automatically set these to:
- DB: temp directory
- CLI: `../os/target/debug/os` (relative to mcp/)
- CWD: temp directory with jj repo

## Known Issues

Some integration tests fail due to CLI/API behavior:
- `should list tasks` - CLI returns unexpected format
- `should get task with progressive context` - Context structure mismatch
- `should add and remove blockers` - Blocker API issue
- `should get status` - VCS status format issue
- `should commit changes` - VCS commit format issue
- `should handle full task lifecycle` - Composite issue

These failures indicate areas needing investigation in the Rust CLI.

## Test Patterns

### VM Context Objects

Objects/arrays created in VM context have different prototypes. Use property checks instead of deep equality:

```typescript
// ✅ Good
const result = await execute('return { a: 1 };') as Record<string, unknown>;
assert.equal(result.a, 1);

// ❌ Bad - fails due to prototype mismatch
const result = await execute('return { a: 1 };');
assert.deepStrictEqual(result, { a: 1 });
```

### Async Execution

All VM code runs in an async IIFE - return values are awaited:

```typescript
const result = await execute(`
  const data = await fetch(...);
  return data;
`);
```

### Error Handling

Execution errors wrap the original error:

```typescript
try {
  await execute('throw new Error("test");');
} catch (err) {
  assert.ok(err instanceof ExecutionError);
  assert.ok(err.message.includes("test"));
  // stackTrace may be undefined
}
```

### Integration Test Setup

Each test suite gets:
- Temporary directory
- SQLite database
- jj repository
- Environment variables configured

Cleanup happens automatically in `after()` hook.
