import { getDB } from './db';
import { getRaster, hasRaster, putRaster, sha256Hex } from './raster-cache';
import { getPersistenceEnabled } from './persistence-pref';

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

/** quality is 1-100 */
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

export async function bakeCanvasToHash(
	canvas: HTMLCanvasElement,
): Promise<string> {
	const blob = await canvasToBlob(canvas);
	const hash = await sha256Hex(await blob.arrayBuffer());
	putRaster(hash, canvas);
	void persistRaster(hash);
	return hash;
}

export async function persistRaster(hash: string): Promise<void> {
	if (!hasIDB() || !getPersistenceEnabled()) return;
	const canvas = getRaster(hash);
	if (!canvas) return;
	const db = getDB();
	if (await db.blobs.get(hash)) return;
	const blob = await canvasToBlob(canvas);
	await db.blobs.put({ hash, blob, refCount: 1, createdAt: Date.now() });
}

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
