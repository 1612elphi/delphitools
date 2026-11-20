import type { AssetSource, Layer, SubstrataDoc } from './doc-model';
import { getColour } from './colour-store';
import { getSnapshot } from './doc-store';
import { importImageFile } from './import-raster';
import { findLayer, leafRenderList } from './layer-tree';
import { getActiveLayerId } from './selection';
import { photoWords } from './photo-words';
import { isFrame, replaceFrameImage } from './strata';
import { toast } from './toast';

export type AssetKind = 'photos' | 'icons';

export interface Asset {
	id: string;
	thumb: string;
	/** fallback when the thumbnail host fails */
	full: string;
	source: AssetSource;
}

export interface AssetPage {
	items: Asset[];
	more: boolean;
}

export class AssetError extends Error {
	constructor(
		readonly kind: 'limited' | 'offline',
		readonly retryAfter = 0,
	) {
		super(kind);
	}
}

// no request before consent
const CONSENT_KEY = 'substrata:assets';

export function assetsAllowed(): boolean {
	try {
		return localStorage.getItem(CONSENT_KEY) === '1';
	} catch {
		return false;
	}
}

export function allowAssets(): void {
	try {
		localStorage.setItem(CONSENT_KEY, '1');
	} catch {
		// session-only consent
	}
}

const TIMEOUT = 20_000;

// built by build-photo-index.mjs
const PHOTOS = '/substrata/photos/';
const PHOTO_PAGE = 20;
const CREATIVE_COMMONS = {
	cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
	pdm: 'https://creativecommons.org/publicdomain/mark/1.0/',
} as Record<string, string>;

/** url, title, creator, landing page, licence */
export type PhotoRow = [string, string, string, string, string];

interface PhotoIndex {
	shard: number;
	count: number;
	words: Record<string, number[]>;
}

export function licenceLabel(licence: string): string {
	if (licence === 'cc0') return 'CC0';
	if (licence === 'pdm') return 'Public domain';
	return licence.toUpperCase();
}

// openverse proxy times out
export function thumbFor(url: string): string {
	if (url.includes('staticflickr.com/'))
		return url.replace(/_[a-z](\.\w+)$/, '_n$1');
	const commons =
		/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w\/\w\w)\/([^/]+\.(?:jpe?g|png|gif))$/i.exec(
			url,
		);
	if (commons)
		return `${commons[1]}/thumb/${commons[2]}/${commons[3]}/250px-${commons[3]}`;
	return url;
}

export function photoAsset(id: number, r: PhotoRow): Asset {
	const [url, title, creator, landing, licence] = r;
	return {
		id: `photo-${id}`,
		thumb: thumbFor(url),
		full: url,
		source: {
			provider: 'openverse',
			title: title || 'Untitled',
			creator: creator || 'Unknown',
			url: landing || url,
			licence: licenceLabel(licence),
			licenceUrl: CREATIVE_COMMONS[licence] ?? null,
		},
	};
}

export function rankPhotos(index: PhotoIndex, query: string): number[] {
	const score = new Map<number, number>();
	for (const w of new Set(photoWords(query)))
		for (const id of index.words[w] ?? [])
			score.set(id, (score.get(id) ?? 0) + 1);
	return [...score]
		.sort((a, b) => b[1] - a[1] || a[0] - b[0])
		.map(([id]) => id);
}

async function getJson(url: string): Promise<unknown> {
	let res: Response;
	try {
		res = await fetch(url, {
			signal: AbortSignal.timeout(TIMEOUT),
		});
	} catch {
		throw new AssetError('offline');
	}
	if (res.status === 429)
		throw new AssetError(
			'limited',
			Number(res.headers.get('Retry-After')) || 60,
		);
	if (!res.ok) throw new AssetError('offline');
	return res.json();
}

let photoIndex: Promise<PhotoIndex> | null = null;
const shards = new Map<number, Promise<PhotoRow[]>>();

// failed load retries next
function loadIndex(): Promise<PhotoIndex> {
	if (!photoIndex) {
		photoIndex = getJson(
			`${PHOTOS}index.json`,
		) as Promise<PhotoIndex>;
		photoIndex.catch(() => (photoIndex = null));
	}
	return photoIndex;
}

function loadShard(n: number): Promise<PhotoRow[]> {
	let shard = shards.get(n);
	if (!shard) {
		shard = getJson(`${PHOTOS}rows-${n}.json`) as Promise<
			PhotoRow[]
		>;
		shard.catch(() => shards.delete(n));
		shards.set(n, shard);
	}
	return shard;
}

async function searchPhotos(query: string, page: number): Promise<AssetPage> {
	const index = await loadIndex();
	const ids = rankPhotos(index, query);
	const slice = ids.slice(page * PHOTO_PAGE, (page + 1) * PHOTO_PAGE);
	const rows = await Promise.all(
		slice.map(async (id) => {
			const shard = await loadShard(
				Math.floor(id / index.shard),
			);
			return photoAsset(id, shard[id % index.shard]!);
		}),
	);
	return { items: rows, more: (page + 1) * PHOTO_PAGE < ids.length };
}

const ICONIFY = 'https://api.iconify.design';
const ICON_PAGE = 48;

interface IconCollection {
	name: string;
	author?: { name: string; url?: string };
	license?: { title: string; url?: string };
}

async function searchIcons(query: string, page: number): Promise<AssetPage> {
	const params = new URLSearchParams({
		query,
		limit: String(ICON_PAGE),
		start: String(page * ICON_PAGE),
	});
	const body = (await getJson(`${ICONIFY}/search?${params}`)) as {
		icons: string[];
		total: number;
		collections: Record<string, IconCollection>;
	};
	return {
		items: body.icons.map((icon) => {
			const [prefix = '', name = ''] = icon.split(':');
			const set = body.collections[prefix];
			const svg = `${ICONIFY}/${prefix}/${name}.svg`;
			return {
				id: icon,
				thumb: svg,
				full: svg,
				source: {
					provider: 'iconify',
					title: `${name} (${set?.name ?? prefix})`,
					creator: set?.author?.name ?? prefix,
					url:
						set?.author?.url ??
						`https://icon-sets.iconify.design/${prefix}/`,
					licence:
						set?.license?.title ??
						'Unknown',
					licenceUrl: set?.license?.url ?? null,
				},
			};
		}),
		more: (page + 1) * ICON_PAGE < body.total,
	};
}

// ponytail: in-memory per session; IndexedDB if the daily limit bites
const cache = new Map<string, Promise<AssetPage>>();

export function searchAssets(
	kind: AssetKind,
	query: string,
	page: number,
): Promise<AssetPage> {
	const key = `${kind}\n${query.trim().toLowerCase()}\n${page}`;
	let hit = cache.get(key);
	if (!hit) {
		hit = (kind === 'photos' ? searchPhotos : searchIcons)(
			query.trim(),
			page,
		);
		hit.catch(() => cache.delete(key));
		cache.set(key, hit);
	}
	return hit;
}

const ICON_SIZE = 512;

async function iconFile(asset: Asset): Promise<File> {
	const url = `${asset.full}?height=${ICON_SIZE}&color=${encodeURIComponent(getColour().hex)}`;
	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
	if (!res.ok) throw new AssetError('offline');
	const img = new Image();
	img.src = URL.createObjectURL(await res.blob());
	try {
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = img.naturalWidth || ICON_SIZE;
		canvas.height = img.naturalHeight || ICON_SIZE;
		canvas.getContext('2d')!.drawImage(
			img,
			0,
			0,
			canvas.width,
			canvas.height,
		);
		const blob = await new Promise<Blob | null>((r) =>
			canvas.toBlob(r, 'image/png'),
		);
		if (!blob) throw new AssetError('offline');
		return new File([blob], asset.source.title, {
			type: 'image/png',
		});
	} finally {
		URL.revokeObjectURL(img.src);
	}
}

async function photoFile(asset: Asset): Promise<File> {
	for (const url of [asset.full, asset.thumb]) {
		try {
			const res = await fetch(url, {
				mode: 'cors',
				signal: AbortSignal.timeout(TIMEOUT),
			});
			const blob = res.ok ? await res.blob() : null;
			if (blob?.type.startsWith('image/'))
				return new File([blob], asset.source.title, {
					type: blob.type,
				});
		} catch {
			// next url
		}
	}
	throw new AssetError('offline');
}

export const ASSET_DRAG = 'application/x-substrata-asset';

// dragover hides payloads
let dragged: Asset | null = null;

export function setDraggedAsset(asset: Asset | null): void {
	dragged = asset;
}

export function takeDraggedAsset(): Asset | null {
	const asset = dragged;
	dragged = null;
	return asset;
}

export interface AssetDrop {
	frame?: string;
	at: { x: number; y: number };
}

// drop frame, else selected
export async function placeAsset(
	asset: Asset,
	drop?: AssetDrop,
): Promise<void> {
	let file: File;
	try {
		file =
			asset.source.provider === 'iconify'
				? await iconFile(asset)
				: await photoFile(asset);
	} catch {
		toast('asset-failed');
		return;
	}
	const target = drop ? drop.frame : getActiveLayerId();
	const layer = target
		? findLayer(getSnapshot()?.layers ?? [], target)
		: null;
	if (isFrame(layer))
		await replaceFrameImage(layer.id, file, asset.source);
	else
		await importImageFile(file, {
			source: asset.source,
			at: drop?.at,
		});
}

function creditLine(s: AssetSource): string {
	const licence = s.licenceUrl
		? `${s.licence} (${s.licenceUrl})`
		: s.licence;
	return `"${s.title}" by ${s.creator}, ${licence}, ${s.url}`;
}

export function creditSources(doc: SubstrataDoc): AssetSource[] {
	const byLine = new Map<string, AssetSource>();
	for (const { layer, visible } of leafRenderList(doc.layers)) {
		const s = sourceOf(layer);
		if (visible && s) byLine.set(creditLine(s), s);
	}
	return [...byLine.values()];
}

export function creditLines(doc: SubstrataDoc): string[] {
	return creditSources(doc).map(creditLine);
}

function sourceOf(layer: Layer): AssetSource | undefined {
	return layer.kind === 'raster' ? layer.source : undefined;
}
