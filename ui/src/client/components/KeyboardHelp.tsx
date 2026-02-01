/**
 * Keyboard shortcuts help modal.
 * Shows all registered shortcuts grouped by scope.
 */

import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  Kbd,
} from "./ui/index.js";
import { useKeyboardContext, type ShortcutScope } from "../lib/keyboard.js";

const SCOPE_LABELS: Record<ShortcutScope, string> = {
  global: "Global",
  list: "Task List",
  graph: "Graph View",
  kanban: "Kanban View",
  detail: "Task Detail",
};

const SCOPE_ORDER: ShortcutScope[] = ["global", "list", "graph", "kanban", "detail"];

export function KeyboardHelp(): React.ReactElement | null {
  const { helpOpen, setHelpOpen, getShortcuts, activeScope } =
    useKeyboardContext();

  // Early return to avoid unnecessary work when closed
  if (!helpOpen) return null;

  const shortcuts = getShortcuts();

  // Group by scope
  const grouped = SCOPE_ORDER.map((scope) => ({
    scope,
    label: SCOPE_LABELS[scope],
    shortcuts: shortcuts.filter((s) => s.scope === scope),
  })).filter((g) => g.shortcuts.length > 0);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogHeader>
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogDescription>
          Active scope:{" "}
          <span className="text-text-primary">{SCOPE_LABELS[activeScope]}</span>
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-6 max-h-[60vh] overflow-y-auto">
        {grouped.map(({ scope, label, shortcuts }) => (
          <div key={scope}>
            <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-2">
              {label}
            </h3>
            <div className="space-y-1">
              {shortcuts.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="text-sm text-text-primary">
                    {s.description}
                  </span>
                  <ShortcutKeys keys={s.key} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </DialogBody>
    </Dialog>
  );
}

/**
 * Renders shortcut keys with proper Kbd styling.
 * Handles modifiers like "Cmd+K" or "Shift+?"
 */
function ShortcutKeys({ keys }: { keys: string }): React.ReactElement {
  const parts = keys.split("+");
  const ariaLabel = parts.map(getAriaLabel).join(" + ");

  return (
    <div className="flex items-center gap-1" role="group" aria-label={ariaLabel}>
      {parts.map((part) => (
        <Kbd key={part} size="sm" aria-hidden="true">
          {formatKey(part)}
        </Kbd>
      ))}
    </div>
  );
}

/** Map key names to display symbols */
function formatKey(key: string): string {
  const MAP: Record<string, string> = {
    Cmd: "\u2318",
    Ctrl: "Ctrl",
    Alt: "\u2325",
    Shift: "\u21E7",
    Space: "Space",
    Escape: "Esc",
    ArrowUp: "\u2191",
    ArrowDown: "\u2193",
    ArrowLeft: "\u2190",
    ArrowRight: "\u2192",
    Enter: "\u21B5",
    Backspace: "\u232B",
  };
  return MAP[key] ?? key;
}

/** Map key names to screen reader labels */
function getAriaLabel(key: string): string {
  const MAP: Record<string, string> = {
    Cmd: "Command",
    Ctrl: "Control",
    Alt: "Option",
    Shift: "Shift",
    Space: "Space",
    Escape: "Escape",
    ArrowUp: "Up Arrow",
    ArrowDown: "Down Arrow",
    ArrowLeft: "Left Arrow",
    ArrowRight: "Right Arrow",
    Enter: "Enter",
    Backspace: "Backspace",
  };
  return MAP[key] ?? key;
}
