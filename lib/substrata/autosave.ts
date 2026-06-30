/**
 * Autosave + restore (M1-9). Best-effort local recovery cache — NOT the durable
 * source of truth (that's the exported file, §5). Debounced write of the active
 * doc to IndexedDB on every change; on load, restore the most-recently-updated
 * project and rehydrate its rasters. Secure-context only — no-ops over file://.
 *
 * Single-project autosave for now; the project manager (M5) builds on the same
 * projects store.
 */

import { getDB } from "./db";
import { getSnapshot, subscribe } from "./doc-store";
import type { Layer, SubstrataDoc } from "./doc-model";
import { hydrateRaster, persistRaster } from "./blobs";
import { getPersistenceEnabled } from "./persistence-pref";

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Persistence writes are hard-gated on the opt-in preference. */
function canPersist(): boolean {
  return hasIDB() && getPersistenceEnabled();
}

export async function saveProject(doc: SubstrataDoc): Promise<void> {
  if (!canPersist()) return;
  await getDB().projects.put({
    id: doc.id,
    name: doc.name,
    doc,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

function rasterHashes(layers: Layer[]): string[] {
  const out: string[] = [];
  for (const l of layers) {
    if (l.kind === "raster") out.push(l.blobHash);
    else if (l.kind === "group") out.push(...rasterHashes(l.children));
  }
  return out;
}

/** Load the most-recently-updated project + rehydrate its rasters, or null.
 *  Only when the user has opted into local storage. */
export async function loadLatestProject(): Promise<SubstrataDoc | null> {
  if (!canPersist()) return null;
  const rec = await getDB().projects.orderBy("updatedAt").last();
  if (!rec) return null;
  await Promise.all(rasterHashes(rec.doc.layers).map((h) => hydrateRaster(h)));
  return rec.doc;
}

/** On opt-in: persist the current scene + all its rasters so a reload restores. */
export async function persistAll(doc: SubstrataDoc): Promise<void> {
  if (!canPersist()) return;
  await Promise.all(rasterHashes(doc.layers).map((h) => persistRaster(h)));
  await saveProject(doc);
}

/** On opt-out: purge the local copy so turning storage off leaves no trace. */
export async function clearPersistedData(): Promise<void> {
  if (!hasIDB()) return;
  const db = getDB();
  await Promise.all([db.projects.clear(), db.blobs.clear(), db.snapshots.clear()]);
}

/** Subscribe to the doc store and persist (debounced). Returns a stop fn. */
export function startAutosave(debounceMs = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const doc = getSnapshot();
    if (doc) void saveProject(doc);
  };
  const unsubscribe = subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
