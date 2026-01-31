# UI Testing with agent-browser

Automated UI testing using [agent-browser](https://github.com/vercel-labs/agent-browser) - a headless browser CLI designed for AI agents.

## Quick Start

```bash
# Ensure dev server is running
cd ui && npm run dev

# Quick verification (< 3s)
npm run test:ui:quick

# Full test suite
npm run test:ui
```

## Available Commands

### Fast Commands (for AI feedback loops)

| Command | Script | Description |
|---------|--------|-------------|
| `npm run test:ui:quick` | `quick` | Fast snapshot + checks (< 3s) |
| `npm run test:ui:verify` | `verify` | Pass/fail assertions |
| `npm run test:ui:capture` | `capture` | Full state for AI analysis |
| `npm run test:ui:flow` | `flow` | Run interaction flows |

### Standard Commands

| Command | Script | Description |
|---------|--------|-------------|
| `npm run test:ui` | `test` | Full test suite with screenshots |
| `npm run test:ui:snapshot` | `snapshot` | Show UI structure (accessibility tree) |
| `npm run test:ui:screenshot` | `screenshot` | Capture single screenshot |
| `npm run test:ui:watch` | `watch` | Continuous testing during dev |
| `npm run test:ui:interact` | `interact` | Open browser for manual testing |

## AI Agent Feedback Loop

Optimized workflow for AI agents iterating on UI changes:

```bash
# 1. Capture current state
./scripts/ai-review.sh capture
# Returns: screenshot path, interactive elements, accessibility tree, metrics

# 2. AI analyzes output and makes code changes

# 3. Compare against previous state
./scripts/ai-review.sh diff
# Shows what changed after code modifications

# 4. Verify assertions pass
./scripts/ai-review.sh verify
# Returns: pass/fail for filters, layout, status indicators

# 5. Test specific interactions
./scripts/ai-review.sh flow filter-blocked  # Test filter
./scripts/ai-review.sh flow select-first    # Test task selection

# Repeat until satisfied
```

### AI Review Commands

| Command | Description |
|---------|-------------|
| `capture` | Full UI state formatted for LLM analysis |
| `verify` | Quick pass/fail assertions |
| `flow <action>` | Run interaction and show before/after |
| `diff` | Compare current vs previous state |
| `analyze <focus>` | Format data for ux/a11y/perf analysis |

## How It Works

agent-browser uses accessibility snapshots with element references (`@e1`, `@e2`, etc.) instead of full DOM, reducing context by ~93%.

### Basic Workflow

```bash
# 1. Navigate
npx agent-browser open http://localhost:5173

# 2. Wait for load
npx agent-browser wait --load networkidle

# 3. Get interactive elements
npx agent-browser snapshot -i
# Output:
# - button "Task Viewer - Local webapp..." [ref=e1]
# - button "Fix CLI/API sync issues" [ref=e2]

# 4. Interact using refs
npx agent-browser click @e1

# 5. Verify state
npx agent-browser screenshot ./result.png

# 6. Cleanup
npx agent-browser close
```

### Snapshot Flags

```bash
npx agent-browser snapshot        # Full accessibility tree
npx agent-browser snapshot -i     # Interactive elements only (recommended)
npx agent-browser snapshot -c     # Compact output
npx agent-browser snapshot -d 3   # Limit depth to 3 levels
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UI_TEST_URL` | `http://localhost:5173` | Dev server URL |
| `UI_TEST_OUTPUT` | `./test-results` | Output directory for screenshots |
| `UI_TEST_INTERVAL` | `5` | Watch mode polling interval (seconds) |
| `OVERSEER_CLI_CWD` | `process.cwd()` | CLI working directory (for database) |

## Testing with Real Data

The API server uses `OVERSEER_CLI_CWD` to locate the `.overseer/` database:

```bash
# Use repo root database (has actual tasks)
OVERSEER_CLI_CWD=/path/to/overseer npm run dev

# Use ui's local database (empty by default)
npm run dev
```

## Test Script Details

The `scripts/test-ui.sh` script provides:

### `test` - Full Suite
1. Opens browser and waits for network idle
2. Screenshots initial state
3. Verifies critical elements (heading, layout)
4. Checks data loading state
5. Lists interactive elements
6. Final screenshot

### `watch` - Development Mode
Polls UI every 5 seconds, logs status, captures screenshots on errors.

### `interact` - Manual Testing
Opens browser and keeps it open for manual `npx agent-browser` commands.

## Common Patterns

### Verify Element Exists
```bash
npx agent-browser snapshot | grep -q "Overseer" && echo "Found"
```

### Wait for Text
```bash
npx agent-browser wait --text "Success"
```

### Check Visibility
```bash
npx agent-browser is visible @e1
```

### Fill Form and Submit
```bash
npx agent-browser fill @e1 "test input"
npx agent-browser click @e2
npx agent-browser wait --load networkidle
```

### Record Video
```bash
npx agent-browser record start ./recording.webm
# ... perform actions ...
npx agent-browser record stop
```

## Troubleshooting

### "No interactive elements"
- Page may still be loading - add `sleep 1` after wait
- Elements may not have proper ARIA roles
- Try full snapshot: `npx agent-browser snapshot`

### Refs Invalid After Navigation
Element refs (`@e1`) become invalid after DOM changes. Always re-snapshot:
```bash
npx agent-browser click @e1
npx agent-browser wait --load networkidle
npx agent-browser snapshot -i  # Get new refs
```

### Browser Not Closing
```bash
npx agent-browser close
# Or kill all:
pkill -f chromium
```

## CI Integration

```bash
#!/bin/bash
set -e

# Start dev server in background
npm run dev &
DEV_PID=$!
sleep 5

# Run tests
npm run test:ui

# Cleanup
kill $DEV_PID
```
