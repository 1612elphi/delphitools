// Assembles the ProseMirror plugin stack for the editor.
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { columnResizing, goToNextCell, tableEditing } from "prosemirror-tables";
import type { Command, Plugin } from "prosemirror-state";
import type { Schema } from "prosemirror-model";
import { buildInputRules } from "./input-rules";
import { focusPlugin } from "./focus-plugin";
import type { EditorSettings } from "./settings";

export function buildPlugins(schema: Schema, settings: EditorSettings): Plugin[] {
  // History, undo-the-autoformat, and toggle marks on the selection (so you can
  // format existing/selected text — input rules only fire as you type forward).
  const keys: Record<string, Command> = {
    "Mod-z": undo,
    "Mod-y": redo,
    "Shift-Mod-z": redo,
    Backspace: undoInputRule,
  };
  if (schema.marks.strong) keys["Mod-b"] = toggleMark(schema.marks.strong);
  if (schema.marks.em) keys["Mod-i"] = toggleMark(schema.marks.em);
  if (schema.marks.code) keys["Mod-`"] = toggleMark(schema.marks.code);
  if (schema.marks.strikethrough) keys["Mod-Shift-x"] = toggleMark(schema.marks.strikethrough);

  const listItem = schema.nodes.list_item;
  const hasTable = !!schema.nodes.table;

  const listKeys: Record<string, Command> = {};
  if (listItem) listKeys["Enter"] = splitListItem(listItem);

  // Tab / Shift-Tab: indent/outdent in a list, otherwise move between table cells.
  const tabChain: Command[] = [];
  const shiftTabChain: Command[] = [];
  if (listItem) {
    tabChain.push(sinkListItem(listItem));
    shiftTabChain.push(liftListItem(listItem));
  }
  if (hasTable) {
    tabChain.push(goToNextCell(1));
    shiftTabChain.push(goToNextCell(-1));
  }
  const navKeys: Record<string, Command> = {};
  if (tabChain.length) navKeys["Tab"] = chainCommands(...tabChain);
  if (shiftTabChain.length) navKeys["Shift-Tab"] = chainCommands(...shiftTabChain);

  const plugins: Plugin[] = [
    buildInputRules(schema),
    keymap(keys),
    keymap(listKeys),
    keymap(navKeys),
    keymap(baseKeymap),
    history(),
    gapCursor(),
    dropCursor({ class: "pm-dropcursor" }),
    focusPlugin(settings),
  ];
  // tableEditing must come last — it broadly captures mouse/arrow/copy events.
  if (hasTable) plugins.push(columnResizing(), tableEditing());
  return plugins;
}
