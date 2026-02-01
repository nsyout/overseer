/**
 * Zustand UI store for multi-view layout state.
 *
 * Manages ephemeral UI coordination:
 * - View mode (graph/kanban/list)
 * - Task selection and focus (keyboard nav)
 * - Detail panel visibility
 *
 * Server state (tasks/learnings) stays in TanStack Query.
 */

import { create } from "zustand";
import type { TaskId } from "../../types.js";

export type ViewMode = "graph" | "kanban" | "list";

interface UIState {
  /** Active view (graph default) */
  viewMode: ViewMode;
  /** Selected task for detail panel */
  selectedTaskId: TaskId | null;
  /** Focused task for keyboard navigation (separate from selection) */
  focusedTaskId: TaskId | null;
  /** Detail panel visibility */
  detailPanelOpen: boolean;
}

interface UIActions {
  setViewMode: (mode: ViewMode) => void;
  setSelectedTaskId: (id: TaskId | null) => void;
  setFocusedTaskId: (id: TaskId | null) => void;
  toggleDetailPanel: () => void;
  setDetailPanelOpen: (open: boolean) => void;
  /** Clear selection/focus if task no longer exists */
  clearIfMissing: (existingIds: Set<TaskId>) => void;
}

export type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>((set) => ({
  // Initial state
  viewMode: "graph",
  selectedTaskId: null,
  focusedTaskId: null,
  detailPanelOpen: true,

  // Actions
  setViewMode: (mode) => set({ viewMode: mode }),

  setSelectedTaskId: (id) =>
    set((state) => ({
      selectedTaskId: id,
      // Auto-open detail panel when selecting, close when clearing
      detailPanelOpen: id !== null ? true : state.detailPanelOpen,
    })),

  setFocusedTaskId: (id) => set({ focusedTaskId: id }),

  toggleDetailPanel: () =>
    set((state) => ({ detailPanelOpen: !state.detailPanelOpen })),

  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),

  clearIfMissing: (existingIds) =>
    set((state) => ({
      selectedTaskId:
        state.selectedTaskId && existingIds.has(state.selectedTaskId)
          ? state.selectedTaskId
          : null,
      focusedTaskId:
        state.focusedTaskId && existingIds.has(state.focusedTaskId)
          ? state.focusedTaskId
          : null,
    })),
}));

/**
 * Selector hooks for specific slices (prevents unnecessary re-renders)
 */
export const useViewMode = () => useUIStore((s) => s.viewMode);
export const useSelectedTaskId = () => useUIStore((s) => s.selectedTaskId);
export const useFocusedTaskId = () => useUIStore((s) => s.focusedTaskId);
export const useDetailPanelOpen = () => useUIStore((s) => s.detailPanelOpen);
