/**
 * Scene file operations (M5): New / Open / Save / Save-a-copy over the
 * `.substrata` format (substrata-file.ts), delivered through browser-fs-access
 * (FS Access picker on Chromium, download/input fallback elsewhere — the
 * ratified M5 dep). The exported file is durable truth (§5); browser storage
 * stays strictly opt-in and untouched here.
 *
 * A held FileSystemHandle makes Save overwrite the opened/last-saved file;
 * Save-a-copy always asks. ponytail: the handle is session-scoped — persisting
 * it (db.handles) is a later nicety.
 */

import { fileOpen, fileSave } from "browser-fs-access";
import { createEmptyDoc, type SubstrataDoc } from "./doc-model";
import { getSnapshot, setDoc } from "./doc-store";
import { packSubstrata, unpackSubstrata } from "./substrata-file";
import { slugifySceneName } from "./export-core";
import { loadProject, persistAll } from "./autosave";
import { getPersistenceEnabled } from "./persistence-pref";
import { toast } from "./toast";

let handle: FileSystemFileHandle | null = null;

function sceneFileName(doc: SubstrataDoc): string {
  return `${slugifySceneName(doc.name)}.substrata`;
}

/** Guard destructive scene swaps: the doc-store history dies with the doc. */
function confirmDiscard(): boolean {
  const doc = getSnapshot();
  if (!doc || (doc.layers.length === 0 && doc.guides.length === 0)) return true;
  return window.confirm("Replace this? Unsaved work is lost.");
}

export function newScene(): void {
  if (!confirmDiscard()) return;
  handle = null;
  setDoc(createEmptyDoc());
}

/** Scene ▸ Open recent: swap to a stored project (same discard guard as
 *  New/Open — the doc-store history dies with the doc). */
export async function openRecent(id: string): Promise<void> {
  const current = getSnapshot();
  if (current?.id === id) return;
  if (!confirmDiscard()) return;
  const doc = await loadProject(id);
  if (!doc) {
    toast("open-failed");
    return;
  }
  handle = null;
  setDoc(doc);
}

export async function openScene(): Promise<void> {
  if (!confirmDiscard()) return;
  let file: File & { handle?: FileSystemFileHandle };
  try {
    file = await fileOpen({ extensions: [".substrata"], description: "Substrata scene" });
  } catch {
    return; // picker dismissed
  }
  let doc: SubstrataDoc;
  try {
    doc = await unpackSubstrata(await file.arrayBuffer());
  } catch {
    // corrupt / not a .substrata — the current scene is untouched
    toast("open-failed");
    return;
  }
  handle = file.handle ?? null;
  setDoc(doc);
  // opted-in browser storage adopts the opened scene (rasters included)
  if (getPersistenceEnabled()) void persistAll(doc);
}

export async function saveScene(asCopy = false): Promise<void> {
  const doc = getSnapshot();
  if (!doc) return;
  const blob = await packSubstrata(doc);
  try {
    const saved = await fileSave(
      blob,
      { fileName: sceneFileName(doc), extensions: [".substrata"], description: "Substrata scene" },
      asCopy ? null : handle,
    );
    if (!asCopy && saved) handle = saved;
    toast("saved");
  } catch {
    // picker dismissed — not an error
  }
}
