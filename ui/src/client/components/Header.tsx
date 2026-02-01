/**
 * Header component with logo, view tabs, and status.
 *
 * Layout: [OVERSEER logo] [Graph|Kanban|List tabs] [spacer] [last-update] [⌘?]
 */

import { tv } from "tailwind-variants";
import { useUIStore, type ViewMode } from "../lib/store.js";
import { useKeyboardContext } from "../lib/keyboard.js";
import { Kbd } from "./ui/Kbd.js";

const VIEW_TABS: Array<{ mode: ViewMode; label: string; shortcut: string }> = [
  { mode: "graph", label: "Graph", shortcut: "1" },
  { mode: "kanban", label: "Kanban", shortcut: "2" },
  { mode: "list", label: "List", shortcut: "3" },
];

const tab = tv({
  base: [
    "px-3 py-1.5 text-sm font-mono",
    "border border-transparent rounded",
    "transition-colors cursor-pointer",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
  ],
  variants: {
    active: {
      true: "bg-accent text-bg-primary border-accent",
      false: "text-text-muted hover:text-text-primary hover:bg-surface-primary",
    },
  },
});

interface HeaderProps {
  /** ISO timestamp of last data update */
  lastUpdated?: string;
}

export function Header({ lastUpdated }: HeaderProps) {
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const { setHelpOpen } = useKeyboardContext();

  const formatLastUpdated = (iso: string): string => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <header className="flex items-center gap-4 px-4 h-12 border-b border-border bg-bg-secondary shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-accent font-mono font-bold text-lg tracking-tight">
          OVERSEER
        </span>
      </div>

      {/* View buttons */}
      <nav className="flex items-center gap-1" aria-label="Views">
        {VIEW_TABS.map(({ mode, label, shortcut }) => (
          <button
            key={mode}
            aria-pressed={viewMode === mode}
            className={tab({ active: viewMode === mode })}
            onClick={() => setViewMode(mode)}
          >
            <span className="flex items-center gap-2">
              {label}
              <Kbd size="sm" aria-hidden="true">
                {shortcut}
              </Kbd>
            </span>
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last updated */}
      {lastUpdated && (
        <span className="text-xs text-text-dim font-mono">
          updated {formatLastUpdated(lastUpdated)}
        </span>
      )}

      {/* Help shortcut */}
      <button
        className="flex items-center gap-1 px-2 py-1 text-text-muted hover:text-text-primary transition-colors rounded hover:bg-surface-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        onClick={() => setHelpOpen(true)}
        aria-label="Show keyboard shortcuts"
      >
        <Kbd size="sm">⌘</Kbd>
        <Kbd size="sm">?</Kbd>
      </button>
    </header>
  );
}
