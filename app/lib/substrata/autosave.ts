import { getDB } from './db';
import { getSnapshot, subscribe } from './doc-store';
import {
	newId,
	stampLoadedDoc,
	type Layer,
	type SubstrataDoc,
} from './doc-model';
import { hydrateRaster, persistRaster } from './blobs';
import { getPersistenceEnabled } from './persistence-pref';

function hasIDB(): boolean {
	return typeof indexedDB !== 'undefined';
}

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

export function rasterHashes(layers: Layer[]): string[] {
	const out: string[] = [];
	for (const l of layers) {
		if (l.kind === 'raster') out.push(l.blobHash);
		else if (l.kind === 'group')
			out.push(...rasterHashes(l.children));
	}
	return out;
}

async function hydrateProject(doc: SubstrataDoc): Promise<SubstrataDoc> {
	await Promise.all(
		rasterHashes(doc.layers).map((h) => hydrateRaster(h)),
	);
	return stampLoadedDoc(doc);
}

export async function loadLatestProject(): Promise<SubstrataDoc | null> {
	if (!canPersist()) return null;
	const rec = await getDB().projects.orderBy('updatedAt').last();
	return rec ? hydrateProject(rec.doc) : null;
}

export interface RecentProject {
	id: string;
	name: string;
	updatedAt: number;
}

export async function listRecentProjects(limit = 6): Promise<RecentProject[]> {
	if (!canPersist()) return [];
	const recs = await getDB()
		.projects.orderBy('updatedAt')
		.reverse()
		.limit(limit)
		.toArray();
	return recs.map((r) => ({
		id: r.id,
		name: r.name,
		updatedAt: r.updatedAt,
	}));
}

export async function loadProject(id: string): Promise<SubstrataDoc | null> {
	if (!canPersist()) return null;
	const rec = await getDB().projects.get(id);
	return rec ? hydrateProject(rec.doc) : null;
}

export async function persistAll(doc: SubstrataDoc): Promise<void> {
	if (!canPersist()) return;
	await Promise.all(
		rasterHashes(doc.layers).map((h) => persistRaster(h)),
	);
	await saveProject(doc);
}

export async function clearPersistedData(): Promise<void> {
	if (!hasIDB()) return;
	const db = getDB();
	await Promise.all([
		db.projects.clear(),
		db.blobs.clear(),
		db.snapshots.clear(),
		db.mattes.clear(),
	]);
}

const SNAPSHOT_KEEP = 20;

async function saveSnapshot(doc: SubstrataDoc): Promise<void> {
	if (!canPersist()) return;
	const db = getDB();
	await db.snapshots.add({
		id: newId(),
		projectId: doc.id,
		doc,
		createdAt: Date.now(),
	});
	const all = await db.snapshots
		.where('projectId')
		.equals(doc.id)
		.sortBy('createdAt');
	if (all.length > SNAPSHOT_KEEP) {
		await db.snapshots.bulkDelete(
			all
				.slice(0, all.length - SNAPSHOT_KEEP)
				.map((r) => r.id),
		);
	}
}

export function startAutosave(debounceMs = 800): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const flush = () => {
		timer = null;
		const doc = getSnapshot();
		if (doc) {
			void saveProject(doc);
			void saveSnapshot(doc);
		}
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
