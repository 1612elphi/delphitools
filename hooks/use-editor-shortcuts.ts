"use client";

import { useEffect } from "react";
import { undo, redo } from "@/lib/substrata/doc-store";
import { openScene, saveScene } from "@/lib/substrata/file-ops";
import { deleteLayers, nudgeSelection } from "@/lib/substrata/layer-ops";
import { getSelectedLayerIds } from "@/lib/substrata/selection";
import { getActiveTool } from "@/lib/substrata/tool";
import { getToolSettings } from "@/lib/substrata/tool-settings";

/**
 * Substrata keyboard map. ⌘/Ctrl+Z = undo, ⌘/Ctrl+Shift+Z or Ctrl+Y = redo.
 * Backspace/Delete removes the selected layers (same path as the layers-panel
 * footer; one undo step). Arrow keys nudge the selection while MOVE is the
 * active tool (step = the MOVE settings' nudge value, ⇧ ×10; one undo step per
 * press). Ignored while typing in a field. Mounted by the editor shell; the
 * top-bar undo/redo buttons call the same doc-store actions.
 */

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      if ((e.key === "Backspace" || e.key === "Delete") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); // Backspace must never trigger browser back-navigation
        deleteLayers(getSelectedLayerIds());
        return;
      }

      const arrow = ARROWS[e.key];
      if (arrow && !e.metaKey && !e.ctrlKey && !e.altKey && getActiveTool() === "move") {
        e.preventDefault();
        const step = getToolSettings().move.nudge * (e.shiftKey ? 10 : 1);
        nudgeSelection(arrow[0] * step, arrow[1] * step);
        return;
      }

      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "s") {
        // ⌘S save · ⇧⌘S save a copy (M5 — matches the Scene menu hints)
        e.preventDefault();
        void saveScene(e.shiftKey);
      } else if (key === "o") {
        e.preventDefault();
        void openScene();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
