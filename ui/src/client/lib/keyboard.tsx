/**
 * Keyboard shortcut framework with scope-based registration.
 *
 * Scopes: global, list, graph, detail
 * - Global shortcuts fire regardless of active scope
 * - View-specific shortcuts fire only when that view is active
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ShortcutScope = "global" | "list" | "graph" | "detail";

export interface Shortcut {
  /** Unique identifier */
  id: string;
  /** Key that triggers this shortcut (e.g., "?" or "Escape" or "Cmd+K") */
  key: string;
  /** Human-readable description */
  description: string;
  /** Scope where this shortcut is active */
  scope: ShortcutScope;
  /** Handler function */
  handler: () => void;
}

interface KeyboardContextValue {
  /** Currently active scope (in addition to global) */
  activeScope: ShortcutScope;
  setActiveScope: (scope: ShortcutScope) => void;
  /** Register a shortcut, returns unregister function */
  register: (shortcut: Shortcut) => () => void;
  /** Get all registered shortcuts */
  getShortcuts: () => Shortcut[];
  /** Check if help modal is open */
  helpOpen: boolean;
  /** Toggle help modal */
  setHelpOpen: (open: boolean) => void;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function useKeyboardContext(): KeyboardContextValue {
  const context = useContext(KeyboardContext);
  if (!context) {
    throw new Error("useKeyboardContext must be used within KeyboardProvider");
  }
  return context;
}

/**
 * Hook to register shortcuts for a specific scope.
 * Automatically unregisters when component unmounts.
 *
 * @param make - Factory function returning shortcuts to register
 * @param deps - Dependencies that trigger re-registration when changed
 */
export function useKeyboardShortcuts(
  make: () => Array<Omit<Shortcut, "id">>,
  deps: readonly unknown[]
): void {
  const { register } = useKeyboardContext();

  useEffect(() => {
    const shortcuts = make();
    const unregisters = shortcuts.map((s) =>
      register({
        ...s,
        // Use stable ID based on scope + key + description prefix
        id: `${s.scope}-${s.key}-${s.description.slice(0, 20)}`,
      })
    );
    return () => unregisters.forEach((u) => u());
    // deps passed by caller - they control when shortcuts re-register
  }, [register, make, ...deps]);
}

/**
 * Normalize a keyboard event to a shortcut key string.
 * Handles modifiers and special keys.
 */
function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = [];

  // Modifiers
  if (e.metaKey) parts.push("Cmd");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey && e.key.length > 1) parts.push("Shift"); // Only for non-printable keys

  // Main key
  const key = e.key;
  if (key === " ") {
    parts.push("Space");
  } else if (key.length === 1) {
    // For single characters, use lowercase unless shift is held
    parts.push(key);
  } else {
    parts.push(key);
  }

  return parts.join("+");
}

interface KeyboardProviderProps {
  children: ReactNode;
}

export function KeyboardProvider({ children }: KeyboardProviderProps): ReactNode {
  const [activeScope, setActiveScope] = useState<ShortcutScope>("global");
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<Map<string, Shortcut>>(new Map());

  const register = useCallback((shortcut: Shortcut): (() => void) => {
    setShortcuts((prev) => {
      const next = new Map(prev);
      next.set(shortcut.id, shortcut);
      return next;
    });

    return () => {
      setShortcuts((prev) => {
        const next = new Map(prev);
        next.delete(shortcut.id);
        return next;
      });
    };
  }, []);

  const getShortcuts = useCallback((): Shortcut[] => {
    return Array.from(shortcuts.values());
  }, [shortcuts]);

  // Global keyboard listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Don't fire shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape to work even in inputs
        if (e.key !== "Escape") {
          return;
        }
      }

      const normalized = normalizeKey(e);

      // Find matching shortcut (global scope or active scope)
      for (const shortcut of shortcuts.values()) {
        if (shortcut.key !== normalized) continue;
        if (shortcut.scope !== "global" && shortcut.scope !== activeScope) continue;

        e.preventDefault();
        try {
          shortcut.handler();
        } catch (err) {
          console.error("Shortcut handler failed:", shortcut.id, err);
        }
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, activeScope]);

  // Built-in "?" shortcut to toggle help
  useEffect(() => {
    const id = "__help__";
    setShortcuts((prev) => {
      const next = new Map(prev);
      next.set(id, {
        id,
        key: "?",
        description: "Show keyboard shortcuts",
        scope: "global",
        handler: () => setHelpOpen((o) => !o),
      });
      return next;
    });

    return () => {
      setShortcuts((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    };
  }, []);

  // Note: Escape to close help is handled by native <dialog> element
  // which fires 'close' event → onOpenChange(false) in Dialog component

  const value = useMemo(
    () => ({
      activeScope,
      setActiveScope,
      register,
      getShortcuts,
      helpOpen,
      setHelpOpen,
    }),
    [activeScope, register, getShortcuts, helpOpen]
  );

  return (
    <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>
  );
}
