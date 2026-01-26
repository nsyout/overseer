# MCP Agent Guide

Overseer MCP server provides a single `execute` tool using the **codemode pattern**: agents write JavaScript that executes server-side, only results return.

## Why Codemode?

Traditional MCP tools require one tool call per operation. Codemode lets agents compose complex workflows in a single execution:

**Traditional (multiple tool calls):**
```
1. create_task(...)
2. add_learning(...)
3. start_task(...)
```

**Codemode (single execution):**
```javascript
const task = await tasks.create({...});
await learnings.add(task.id, "...");
await tasks.start(task.id);
return task;
```

**Benefits:**
- Fewer round trips
- Agents handle TypeScript APIs better than tool schemas
- Compose operations naturally with JS control flow

## The `execute` Tool

Single tool that runs JavaScript in VM sandbox with `tasks`, `learnings`, `vcs` APIs.

**Input:** `code` parameter (JavaScript string)  
**Output:** Return value from code execution  
**Timeout:** 30 seconds  
**Truncation:** Outputs >50,000 chars truncated with preview

## Type Definitions

```typescript
// Task
interface Task {
  id: string;              // ULID (task_01JQAZ...)
  description: string;
  context: string;         // Additional info
  status: "pending" | "in_progress" | "completed";
  priority: number;        // 1-10
  depth: number | null;    // 0=milestone, 1=task, 2=subtask
  parent_id: string | null;
  commit_sha: string | null; // Auto-populated on complete
  result: string | null;   // Completion notes
  created_at: string;      // ISO 8601
  started_at: string | null;
  completed_at: string | null;
}

// Task with progressive context
interface TaskWithContext {
  task: Task;
  context: {
    own: string;           // Always present
    parent?: string;       // If depth > 0
    milestone?: string;    // If depth > 1
  };
  learnings: {
    milestone: Learning[]; // From root
    parent: Learning[];    // From parent
  };
}

// Learning
interface Learning {
  id: string;              // ULID (learning_01JQAZ...)
  task_id: string;
  content: string;
  source_task_id: string | null;
  created_at: string;
}

// VCS types
interface VcsInfo {
  vcs_type: "jj" | "git" | "none";
  root: string | null;
}

interface VcsStatus {
  files: string[];         // Changed files
  current_commit_id: string;
}

interface LogEntry {
  id: string;
  description: string;
  author: string;
  timestamp: string;
}

interface DiffEntry {
  path: string;
  change_type: "added" | "modified" | "removed";
}

interface CommitResult {
  commit_id: string;
}
```

## API Reference

### `tasks` API

```javascript
// List tasks
tasks.list(filter?: {
  parentId?: string;
  ready?: boolean;      // No blockers, not completed
  completed?: boolean;
}): Promise<Task[]>

// Get task with context
tasks.get(id: string): Promise<TaskWithContext>

// Create task
tasks.create(input: {
  description: string;
  context?: string;
  parentId?: string;     // Makes this a subtask
  priority?: 1 | 2 | 3 | 4 | 5;
  blockedBy?: string[];  // Task IDs
}): Promise<Task>

// Update task
tasks.update(id: string, input: {
  description?: string;
  context?: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  parentId?: string;
}): Promise<Task>

// State transitions
tasks.start(id: string): Promise<Task>
tasks.complete(id: string, result?: string): Promise<Task>
tasks.reopen(id: string): Promise<Task>
tasks.delete(id: string): Promise<void>

// Blockers
tasks.block(taskId: string, blockerId: string): Promise<void>
tasks.unblock(taskId: string, blockerId: string): Promise<void>

// Queries
tasks.nextReady(milestoneId?: string): Promise<Task | null>
```

### `learnings` API

```javascript
// Add learning to task
learnings.add(
  taskId: string,
  content: string,
  sourceTaskId?: string  // Optional source task
): Promise<Learning>

// List learnings for task
learnings.list(taskId: string): Promise<Learning[]>

// Delete learning
learnings.delete(id: string): Promise<void>
```

### `vcs` API

```javascript
// Detect VCS type
vcs.detect(): Promise<VcsInfo>

// Get status
vcs.status(): Promise<VcsStatus>

// Get log
vcs.log(limit?: number): Promise<LogEntry[]>

// Get diff
vcs.diff(base?: string): Promise<DiffEntry[]>

// Create commit
vcs.commit(message: string): Promise<CommitResult>
```

## Usage Patterns

### Create Task Hierarchy

```javascript
// Create milestone
const milestone = await tasks.create({
  description: "Implement user authentication",
  context: "JWT-based auth with refresh tokens, bcrypt for passwords",
  priority: 5
});

// Create subtasks
const loginTask = await tasks.create({
  description: "Add login endpoint",
  parentId: milestone.id,
  priority: 4
});

const signupTask = await tasks.create({
  description: "Add signup endpoint", 
  parentId: milestone.id,
  priority: 3,
  blockedBy: [loginTask.id]  // Blocked until login done
});

return { milestone, tasks: [loginTask, signupTask] };
```

### Start and Complete Task

```javascript
// Get next ready task
const task = await tasks.nextReady();

if (!task) {
  return "No tasks ready";
}

// Start task
await tasks.start(task.id);

// ... do work ...

// Add learnings as you go
await learnings.add(
  task.id,
  "bcrypt rounds should be 12 for production",
  null  // no source task
);

// Complete (auto-captures commit SHA)
await tasks.complete(
  task.id,
  "Login endpoint implemented with JWT tokens"
);

return task;
```

### Progressive Context

```javascript
// Get subtask with inherited context
const subtask = await tasks.get(subtaskId);

// subtask.context contains:
// - own: subtask's context
// - parent: parent task's context  
// - milestone: root milestone's context

// subtask.learnings contains:
// - milestone: learnings from root
// - parent: learnings from parent task

console.log("Milestone context:", subtask.context.milestone);
console.log("Inherited learnings:", subtask.learnings.parent);
```

### VCS Integration

```javascript
// Check VCS status before committing
const status = await vcs.status();
console.log("Changed files:", status.files);

if (status.files.length === 0) {
  return "No changes to commit";
}

// Show recent commits
const log = await vcs.log(5);
console.log("Recent commits:", log);

// Create commit
const result = await vcs.commit("Implement login endpoint");

// Complete task (will capture this commit SHA)
await tasks.complete(taskId, "Login endpoint complete");
```

### Error Handling

```javascript
try {
  const task = await tasks.get("task_01JQAZ...");
  await tasks.complete(task.id);
} catch (err) {
  if (err.message.includes("pending children")) {
    // Task has incomplete subtasks
    const children = await tasks.list({ parentId: task.id, completed: false });
    return `Cannot complete: ${children.length} pending children`;
  }
  throw err;
}
```

### Batch Operations

```javascript
// Find and complete multiple tasks
const readyTasks = await tasks.list({ ready: true });

const completed = [];
for (const task of readyTasks) {
  if (task.description.includes("test")) {
    await tasks.start(task.id);
    await tasks.complete(task.id, "Tests passing");
    completed.push(task);
  }
}

return { completed: completed.length, tasks: completed };
```

### Search and Filter

```javascript
// Get all completed tasks
const done = await tasks.list({ completed: true });

// Get pending children of milestone
const milestone = await tasks.get(milestoneId);
const pending = await tasks.list({
  parentId: milestone.task.id,
  completed: false
});

// Calculate progress
const total = await tasks.list({ parentId: milestone.task.id });
const progress = (done.length / total.length) * 100;

return {
  milestone: milestone.task.description,
  progress: `${progress.toFixed(0)}%`,
  pending: pending.length,
  done: done.length
};
```

## Best Practices

### 1. Use Progressive Context

Always fetch tasks with `tasks.get()` to access inherited context:

```javascript
// ✅ Good - gets full context
const task = await tasks.get(taskId);
console.log(task.context.milestone); // Root context

// ❌ Bad - no context
const tasks = await tasks.list({ parentId: milestoneId });
// tasks[0] has no inherited context
```

### 2. Capture Learnings Early

Add learnings as you discover them, don't wait:

```javascript
// ✅ Good - capture immediately
await learnings.add(taskId, "bcrypt default rounds too low");
// ... continue working ...

// ❌ Bad - might forget later
// (working on task without capturing learnings)
```

### 3. Use Blockers for Dependencies

Explicit blockers prevent premature task start:

```javascript
// ✅ Good - explicit dependency
await tasks.create({
  description: "Deploy to prod",
  blockedBy: [testTaskId, reviewTaskId]
});

// ❌ Bad - implicit ordering
await tasks.create({ description: "Deploy to prod" });
// No guarantee tests/review done first
```

### 4. Always Check VCS Before Commit

Verify there are changes before committing:

```javascript
// ✅ Good - check first
const status = await vcs.status();
if (status.files.length > 0) {
  await vcs.commit("Update auth");
}

// ❌ Bad - might fail on empty commit
await vcs.commit("Update auth");
```

### 5. Return Useful Data

Return structured data for agent inspection:

```javascript
// ✅ Good - return summary
return {
  created: milestone.id,
  subtasks: tasks.length,
  nextReady: tasks.find(t => !t.blockedBy)?.id
};

// ❌ Bad - unclear result
return "Done";
```

## Common Patterns

### Task Breakdown

```javascript
const milestone = await tasks.create({
  description: "User auth system",
  context: "JWT + refresh tokens"
});

const subtasks = [
  "Add login endpoint",
  "Add signup endpoint", 
  "Add token refresh",
  "Add password reset"
];

for (const desc of subtasks) {
  await tasks.create({
    description: desc,
    parentId: milestone.id
  });
}

return await tasks.list({ parentId: milestone.id });
```

### Work Session

```javascript
// Get next task with full context
const task = await tasks.nextReady();
if (!task) return "No ready tasks";

// Review context
console.log("Milestone:", task.context.milestone);
console.log("Parent:", task.context.parent);
console.log("Task:", task.context.own);

// Check inherited learnings
console.log("Learnings:", task.learnings.parent);

// Start work
await tasks.start(task.task.id);
return task;
```

### Completion with Commit

```javascript
// Verify work done
const status = await vcs.status();
if (status.files.length === 0) {
  return "No changes to commit";
}

// Commit changes
const commit = await vcs.commit("Implement feature X");

// Complete task (auto-captures commit SHA)
const completed = await tasks.complete(
  taskId,
  "Feature X implemented and tested"
);

return { task: completed, commit: commit.commit_id };
```

## Troubleshooting

### Task not ready?

```javascript
const task = await tasks.get(taskId);

// Check blockers
const blockers = await tasks.list({
  // Get blocker details by querying each blocked_by ID
});

// Unblock if needed
if (blockerCompleted) {
  await tasks.unblock(taskId, blockerId);
}
```

### Can't complete task?

```javascript
// Error: "pending children"
const children = await tasks.list({
  parentId: taskId,
  completed: false
});

console.log(`${children.length} children still pending`);
// Complete children first
```

### No VCS?

```javascript
const info = await vcs.detect();
if (info.vcs_type === "none") {
  console.log("No VCS found - run from repo root");
  // Task completion won't capture commit_sha
}
```

## Limitations

- **Timeout:** 30s max execution
- **Output:** 50,000 chars max (larger outputs truncated)
- **No network:** Sandbox has no fetch/http access
- **No filesystem:** Cannot read/write files directly
- **VCS:** Must run from repo root with `.jj/` or `.git/`

## Data Export/Import

For backup, migration, or version control of task data, use the CLI `data` commands:

```bash
# Export all tasks and learnings
os data export -o backup.json

# Import from file
os data import backup.json

# Import with clean slate
os data import backup.json --clear
```

These are CLI-only commands (not available via MCP execute tool). Use cases:
- Backup task hierarchies before major changes
- Share task plans between projects or team members
- Version control task definitions in git
- Migrate data between machines

See [CLI Reference](CLI.md#data-management) for full documentation.

## See Also

- [CLI Reference](CLI.md) - Direct `os` command usage
- [Architecture](ARCHITECTURE.md) - System design details
