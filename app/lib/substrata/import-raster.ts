/* fabric raster size cap */

import { clampToCap } from './webgl-limits';
import { createRasterLayer } from './doc-model';
import type { Artboard, AssetSource, Transform } from './doc-model';
import { getSnapshot, update } from './doc-store';
import { setActiveLayer } from './selection';
import { getRaster, putRaster, sha256Hex } from './raster-cache';
import { persistRaster } from './blobs';
import { toast } from './toast';

function placeOnArtboard(artboard: Artboard, w: number, h: number): Transform {
	const fit = Math.min(1, artboard.width / w, artboard.height / h);
	return {
		x: artboard.width / 2,
		y: artboard.height / 2,
		scaleX: fit,
		scaleY: fit,
		angle: 0,
		flipX: false,
		flipY: false,
	};
}

export interface ImportOptions {
	at?: { x: number; y: number };
	source?: AssetSource;
}

export async function importImageFile(
	file: File,
	opts?: ImportOptions,
): Promise<void> {
	const raster = await ingestImage(file);
	if (!raster) return;
	const { hash, width: w, height: h } = raster;
	const artboard = getSnapshot()?.artboard;
	if (!artboard) return;

	const transform = placeOnArtboard(artboard, w, h);
	if (opts?.at) {
		transform.x = opts.at.x;
		transform.y = opts.at.y;
	}
	const layer = createRasterLayer({
		name: file.name,
		blobHash: hash,
		naturalWidth: w,
		naturalHeight: h,
		transform,
	});
	if (opts?.source) layer.source = opts.source;
	// select before update
	setActiveLayer(layer.id);
	update((doc) => ({
		...doc,
		layers: [...doc.layers, layer],
		updatedAt: Date.now(),
	}));
	toast('image-added');
}

export async function ingestImage(
	file: File,
): Promise<{ hash: string; width: number; height: number } | null> {
	if (!file.type.startsWith('image/')) return null;

	const buf = await file.arrayBuffer();
	const hash = await sha256Hex(buf);

	let raster = getRaster(hash);
	if (!raster) {
		const blob = new Blob([buf], { type: file.type });
		const probe = await createImageBitmap(blob);
		const { width, height, scale } = clampToCap(
			probe.width,
			probe.height,
		);

		let bitmap = probe;
		if (scale < 1) {
			probe.close();
			bitmap = await createImageBitmap(blob, {
				resizeWidth: width,
				resizeHeight: height,
				resizeQuality: 'high',
			});
		}

		raster = document.createElement('canvas');
		raster.width = width;
		raster.height = height;
		const ctx = raster.getContext('2d');
		if (!ctx) {
			bitmap.close();
			return null;
		}
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		putRaster(hash, raster);
		void persistRaster(hash);
	}
	return { hash, width: raster.width, height: raster.height };
}

export async function importClipboardImage(
	opts?: ImportOptions,
): Promise<void> {
	try {
		const items = await navigator.clipboard.read();
		for (const item of items) {
			const type = item.types.find((t) =>
				t.startsWith('image/'),
			);
			if (type) {
				const blob = await item.getType(type);
				await importImageFile(
					new File([blob], 'clipboard', { type }),
					opts,
				);
				return;
			}
		}
	} catch {
		/* ignore clipboard errors */
	}
	toast('paste-empty');
}
