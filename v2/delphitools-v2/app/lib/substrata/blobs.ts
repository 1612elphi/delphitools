/**
 * Blob persistence (M1-9). Bridges the in-memory raster cache and the Dexie blob
 * store: persist a clamped working raster to IndexedDB (content-addressed by the
 * same hash the doc references), and hydrate it back on reload. Secure-context
 * only — degrades to a no-op over file:// (no IndexedDB).
 *
 * v1 stores each blob once (content-addressed dedupe). Ref-count GC of orphaned
 * blobs is deferred (noted in §5/M1-9); orphans are harmless until then.
 */

import { getDB } from './db';
import { getRaster, hasRaster, putRaster, sha256Hex } from './raster-cache';
import { getPersistenceEnabled } from './persistence-pref';

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

/** Promisified `canvas.toBlob`. `quality` is 1–100 (lossy mime types only).
 *  Shared with the export encoder (export-encode.ts). */
export function canvasToBlob(
	canvas: HTMLCanvasElement,
	mime = 'image/png',
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(b) =>
				b
					? resolve(b)
					: reject(new Error('toBlob failed')),
			mime,
			quality !== undefined ? quality / 100 : undefined,
		);
	});
}

/** Bake a canvas into the content-addressed raster world: encode → hash the
 *  encoded bytes → cache under the hash → persist (best-effort, opt-in
 *  gated). The one bake idiom SELECT extract/cut and Rasterize share. */
export async function bakeCanvasToHash(
	canvas: HTMLCanvasElement,
): Promise<string> {
	const blob = await canvasToBlob(canvas);
	const hash = await sha256Hex(await blob.arrayBuffer());
	putRaster(hash, canvas);
	void persistRaster(hash);
	return hash;
}

/** Persist a cached raster (deduped by hash). No-op if persistence is off or
 *  already stored. */
export async function persistRaster(hash: string): Promise<void> {
	if (!hasIDB() || !getPersistenceEnabled()) return;
	const canvas = getRaster(hash);
	if (!canvas) return;
	const db = getDB();
	if (await db.blobs.get(hash)) return; // content-addressed: already stored
	const blob = await canvasToBlob(canvas);
	await db.blobs.put({ hash, blob, refCount: 1, createdAt: Date.now() });
}

/** Decode a persisted raster back into the in-memory cache. Returns false if
 *  there's nothing stored under `hash`. */
export async function hydrateRaster(hash: string): Promise<boolean> {
	if (hasRaster(hash)) return true;
	if (!hasIDB()) return false;
	const rec = await getDB().blobs.get(hash);
	if (!rec) return false;
	const bitmap = await createImageBitmap(rec.blob);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
	bitmap.close();
	putRaster(hash, canvas);
	return true;
}
