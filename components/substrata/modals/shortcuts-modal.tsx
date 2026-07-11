"use client";

import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Keyboard-shortcuts sheet (Help ▸ Keyboard shortcuts). Pure reference: key
 * combos are data, action names are the same standard-vocabulary chrome the
 * omnibar/menus already ship (tool names, Undo/Redo, Save — the BLEND_OPTIONS
 * precedent). Grouped to mirror the keymap sources: omnibar subtool keys,
 * use-editor-shortcuts, and the viewport gestures.
 */

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Tools",
    rows: [
      ["V", "Move"],
      ["C", "Crop"],
      ["M", "Marquee"],
      ["L", "Lasso"],
      ["W", "Wand"],
      ["A", "Adjust"],
      ["T", "Text"],
      ["P", "Pieces"],
      ["U", "Primitives"],
      ["B", "Brush"],
      ["N", "Pencil"],
    ],
  },
  {
    title: "Edit",
    rows: [
      ["⌘Z", "Undo"],
      ["⇧⌘Z / Ctrl+Y", "Redo"],
      ["⌫", "Delete selection"],
      ["← ↑ → ↓", "Nudge selection (⇧ ×10)"],
      ["⏎", "Extract pixel selection"],
      ["Esc", "Deselect / leave crop"],
    ],
  },
  {
    title: "Scene",
    rows: [
      ["⌘S", "Save"],
      ["⇧⌘S", "Save a copy"],
      ["⌘O", "Open"],
      ["⌘I", "Import image"],
    ],
  },
  {
    title: "View",
    rows: [
      ["Space + drag", "Pan"],
      ["Scroll", "Pan"],
      ["⌘ Scroll / pinch", "Zoom"],
      ["Two fingers (touch)", "Pan + pinch zoom"],
    ],
  },
];

export function ShortcutsModal() {
  return (
    <DialogContent
      className="max-w-lg gap-0 border-2 border-border p-0"
      aria-describedby={undefined}
    >
      <DialogHeader className="border-b-2 border-border px-4 py-3 text-left">
        <DialogTitle className="pr-8 text-sm font-bold uppercase tracking-wide">
          {/* reuses the Help-menu item's shipped label */}
          Keyboard shortcuts
        </DialogTitle>
      </DialogHeader>
      <div className="grid max-h-[70vh] grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto px-4 py-4">
        {GROUPS.map((g) => (
          <section key={g.title} className="space-y-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              {g.title}
            </div>
            <table className="w-full text-xs">
              <tbody>
                {g.rows.map(([keys, action]) => (
                  <tr key={keys + action} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap py-1 pr-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {keys}
                    </td>
                    <td className="py-1">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </DialogContent>
  );
}
