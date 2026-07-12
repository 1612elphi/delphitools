/**
 * Font registry (M2-3, Ruby's 2026-07-06 call): the app ships NO font files —
 * the three choices are SYSTEM STACKS (sans/serif/mono), so there is nothing
 * to load and no fonts.ready gating. Custom fonts come in via local FontFace
 * upload (the file never leaves the browser) and live for the SESSION — a doc
 * naming a missing family falls back to the sans stack at render (accepted
 * v1 limit; persisting font files is M5 territory).
 *
 * Doc layers store a font-choice id ("sans" | "serif" | "mono") or an
 * uploaded family name; resolveFontCss turns either into a canvas-safe
 * font-family string at render time.
 */

export interface FontChoice {
  id: string;
  /** standard type vocabulary — functional chrome */
  label: string;
  css: string;
}

export const FONT_CHOICES: FontChoice[] = [
  { id: "sans", label: "Sans", css: 'ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif' },
  { id: "serif", label: "Serif", css: 'ui-serif, Georgia, "Times New Roman", serif' },
  { id: "mono", label: "Mono", css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
];

const SANS = FONT_CHOICES[0].css;

/** Session-uploaded families (FontFace, already loaded + added). */
let uploaded: string[] = [];
const listeners = new Set<() => void>();

export function getUploadedFonts(): string[] {
  return uploaded;
}

export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Load a local font file into the document; returns the family name (from
 *  the file name — data, not copy). Await completes AFTER the face is usable,
 *  so callers can render immediately. */
export async function uploadLocalFont(file: File): Promise<string> {
  const family = file.name.replace(/\.[^.]+$/, "");
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  if (!uploaded.includes(family)) {
    uploaded = [...uploaded, family];
    for (const l of listeners) l();
  }
  return family;
}

/** Font-choice id / uploaded family → a canvas-usable font-family string.
 *  Unknown (e.g. an uploaded family after reload) falls back to sans. */
export function resolveFontCss(family: string): string {
  const choice = FONT_CHOICES.find((c) => c.id === family);
  if (choice) return choice.css;
  if (uploaded.includes(family)) return `"${family}"`;
  return SANS;
}

/** Display label for a stored family (choice label or the family itself). */
export function fontLabel(family: string): string {
  return FONT_CHOICES.find((c) => c.id === family)?.label ?? family;
}
