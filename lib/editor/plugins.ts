// Assembles the ProseMirror plugin stack for the editor.
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
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

  const listKeys: Record<string, Command> = {};
  if (schema.nodes.list_item) {
    listKeys["Enter"] = splitListItem(schema.nodes.list_item);
    listKeys["Tab"] = sinkListItem(schema.nodes.list_item);
    listKeys["Shift-Tab"] = liftListItem(schema.nodes.list_item);
  }

  return [
    buildInputRules(schema),
    keymap(keys),
    keymap(listKeys),
    keymap(baseKeymap),
    history(),
    gapCursor(),
    dropCursor({ class: "pm-dropcursor" }),
    focusPlugin(settings),
  ];
}
