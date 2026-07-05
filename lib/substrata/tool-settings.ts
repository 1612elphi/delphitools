/**
 * Per-tool settings store (§8) — the shared state behind the omnibar's
 * contextual zone TODAY and the tools themselves in M2/M3 (BUILD-PLAN M2-8's
 * "settings zone swaps by active tool" reads this; the future tool settings
 * UIs write it). Transient UI state, NOT document truth — a tool setting
 * describes the next edit, not the scene. Same useSyncExternalStore shape as
 * the other UI stores.
 *
 * Defaults are structural placeholders ratified when each tool lands (M2 TEXT/
 * PIECES/SELECT). Mode words (touch/cover, group/separate) are Ruby's own
 * terms — functional chrome, not authored copy.
 */

import type { PieceShape } from "./doc-model";

export interface MoveSettings {
  /** arrow-key nudge step in scene px (⇧ multiplies ×10) */
  nudge: number;
}

export interface SelectSettings {
  // the active SELECT subtool (select/lasso/wand) lives in tool.ts activeSubs
  /** select head (marquee): a layer counts as selected when touched vs covered */
  mode: "touch" | "cover";
  /** magnetic lasso edge sensitivity, 0–100 % */
  sensitivity: number;
  /** colour-range / magic-wand tolerance, 0–255 */
  tolerance: number;
}

export interface TextSettings {
  fontFamily: string;
  /** px at scene scale */
  fontSize: number;
}

/** The five primitives — re-exported so panel code keeps one import site;
 *  the doc-model ShapeParams discriminant is the truth. */
export type { PieceShape } from "./doc-model";

export interface PiecesSettings {
  shape: PieceShape;
  /** Next-shape fill; hex only here — gradient authoring arrives with the M4
   *  picker sink (the doc model already stores gradients). */
  fill: string;
  /** null = no stroke. A line falls back to stroking with `fill` so it renders. */
  stroke: { colour: string; width: number } | null;
  /** rectangle */
  cornerRadius: number;
  /** polygon */
  sides: number;
  /** star */
  starPoints: number;
  /** star inner radius as a fraction of the outer (0–1) */
  starInnerRatio: number;
  /** brush / pencil stroke sizes (scene px) — the freehand subtools */
  brushSize: number;
  pencilSize: number;
}

export interface ToolSettings {
  /** Multi-selection transforms as ONE group vs each layer about its own
   *  centre. SHARED by MOVE and SELECT (Ruby: "move is also transform") —
   *  both tools' settings/read-outs bind to this one flag. */
  transformAsGroup: boolean;
  move: MoveSettings;
  select: SelectSettings;
  text: TextSettings;
  pieces: PiecesSettings;
}

const DEFAULTS: ToolSettings = {
  transformAsGroup: true,
  move: { nudge: 1 },
  select: { mode: "touch", sensitivity: 50, tolerance: 32 },
  text: { fontFamily: "Inter", fontSize: 64 },
  pieces: {
    shape: "rectangle",
    fill: "#3e6b33", // the house green — colour data, not copy; M4 wires the picker
    stroke: null,
    cornerRadius: 0,
    sides: 6,
    starPoints: 5,
    starInnerRatio: 0.5,
    brushSize: 24,
    pencilSize: 6,
  },
};

let settings: ToolSettings = DEFAULTS;
const listeners = new Set<() => void>();

export function getToolSettings(): ToolSettings {
  return settings;
}

export function subscribeToolSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Patch one tool's settings (immutably — new object per change). */
export function updateToolSettings<K extends "move" | "select" | "text" | "pieces">(
  tool: K,
  patch: Partial<ToolSettings[K]>,
): void {
  settings = { ...settings, [tool]: { ...settings[tool], ...patch } };
  for (const l of listeners) l();
}

export function setTransformAsGroup(transformAsGroup: boolean): void {
  if (settings.transformAsGroup === transformAsGroup) return;
  settings = { ...settings, transformAsGroup };
  for (const l of listeners) l();
}
