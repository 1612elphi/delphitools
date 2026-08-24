import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { stampLoadedDoc, type SubstrataDoc } from './doc-model';
import { rasterHashes } from './autosave';
import { getRaster, putRaster, sha256Hex } from './raster-cache';
import { canvasToBlob } from './blobs';

const FORMAT_VERSION = 1;

export async function packSubstrata(doc: SubstrataDoc): Promise<Blob> {
	const files: Record<string, Uint8Array> = {
		'manifest.json': strToU8(
			JSON.stringify({ formatVersion: FORMAT_VERSION, doc }),
		),
	};
	for (const hash of new Set(rasterHashes(doc.layers))) {
		const canvas = getRaster(hash);
		if (!canvas) continue;
		const blob = await canvasToBlob(canvas);
		files[`blobs/${hash}`] = new Uint8Array(
			await blob.arrayBuffer(),
		);
	}
	return new Blob([zipSync(files, { level: 0 })], {
		type: 'application/zip',
	});
}

export async function unpackSubstrata(
	data: ArrayBuffer,
): Promise<SubstrataDoc> {
	const files = unzipSync(new Uint8Array(data));
	const manifestBytes = files['manifest.json'];
	if (!manifestBytes)
		throw new Error('Not a .substrata file (no manifest)');
	const manifest = JSON.parse(strFromU8(manifestBytes)) as {
		formatVersion?: number;
		doc?: SubstrataDoc;
	};
	const doc = manifest.doc;
	if (
		typeof manifest.formatVersion !== 'number' ||
		manifest.formatVersion > FORMAT_VERSION ||
		!doc ||
		!doc.artboard ||
		!Array.isArray(doc.layers)
	) {
		throw new Error('Unsupported or malformed .substrata manifest');
	}

	await Promise.all(
		Object.entries(files)
			.filter(([name]) => name.startsWith('blobs/'))
			.map(async ([name, bytes]) => {
				const hash = name.slice('blobs/'.length);
				// avoid hashing zip archive
				const standalone = new Uint8Array(bytes);
				if (
					(await sha256Hex(standalone.buffer)) !==
					hash
				)
					return;
				const bitmap = await createImageBitmap(
					new Blob([standalone], {
						type: 'image/png',
					}),
				);
				const canvas = document.createElement('canvas');
				canvas.width = bitmap.width;
				canvas.height = bitmap.height;
				canvas.getContext('2d')!.drawImage(
					bitmap,
					0,
					0,
				);
				bitmap.close();
				putRaster(hash, canvas);
			}),
	);
	return stampLoadedDoc(doc);
}
