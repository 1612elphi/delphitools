/**
 * In-memory, content-addressed raster cache (SHA-256 hex → clamped <canvas>).
 * The doc model stores only a `blobHash`; the Fabric reconciler reads the decoded
 * raster from here, keeping the model pure and serialisable. Content addressing
 * means re-importing the same bytes dedupes automatically.
 *
 * Session-only for now — M1-9 backs this with the Dexie blob store for
 * persistence across reloads. <canvas> (not ImageBitmap) because Fabric's image
 * source must be HTMLImageElement | HTMLVideoElement | HTMLCanvasElement.
 */

const cache = new Map<string, HTMLCanvasElement>();

export function putRaster(hash: string, canvas: HTMLCanvasElement): void {
	cache.set(hash, canvas);
}

export function getRaster(hash: string): HTMLCanvasElement | undefined {
	return cache.get(hash);
}

export function hasRaster(hash: string): boolean {
	return cache.has(hash);
}

/** SHA-256 hex content address of bytes. Secure-context only (crypto.subtle). */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
