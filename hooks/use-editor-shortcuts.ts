"use client";

import { useEffect } from "react";
import { undo, redo } from "@/lib/substrata/doc-store";

/**
 * Substrata keyboard map (M1-8 slice: undo/redo). ⌘/Ctrl+Z = undo,
 * ⌘/Ctrl+Shift+Z or Ctrl+Y = redo. Ignored while typing in a field. Mounted by
 * the editor shell; the top-bar undo/redo buttons (gated) will call the same
 * doc-store actions.
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

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

      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
