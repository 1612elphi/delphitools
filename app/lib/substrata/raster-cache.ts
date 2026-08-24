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

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
