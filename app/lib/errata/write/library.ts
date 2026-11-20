import Dexie, { type Table } from 'dexie';
import { persistencePref } from 'delphitools-v2/lib/substrata/persistence-pref';
import { uniqueName } from 'delphitools-v2/lib/substrata/projects';
import { openAta, saveAta } from './ata';
import { ensureDocFonts } from './editor';
import { newId } from './model';
import { writeStore } from './store';
import type { WriteDoc } from './types';

export interface StoredDoc {
	id: string;
	name: string;
	updatedAt: number;
	thumbnail?: Blob;
}

interface DocRecord extends StoredDoc {
	ata: Uint8Array;
}

class ErrataDB extends Dexie {
	documents!: Table<DocRecord, string>;

	constructor() {
		super('errata');
		this.version(1).stores({ documents: 'id, updatedAt' });
	}
}

let db: ErrataDB | null = null;
const table = () => (db ??= new ErrataDB()).documents;

/** written documents stay in this browser only after opt-in */
export const persist = persistencePref('errata:persist');

const canPersist = () => typeof indexedDB !== 'undefined' && persist.get();

const DEBOUNCE = 800;
let current: string | null = null;
let next: string | null = null;
let session = writeStore.session();
let last: WriteDoc | null = null;
let pending: { id: string; doc: WriteDoc } | null = null;
let timer = 0;

export const currentId = () => current;

/** Writes the last edit now. */
export async function flush(): Promise<void> {
	clearTimeout(timer);
	const p = pending;
	pending = null;
	if (!p || !canPersist()) return;
	// ponytail: zips the whole document per save, images included; store images apart if saves get slow
	const rec = {
		name: p.doc.name,
		ata: saveAta(p.doc),
		updatedAt: Date.now(),
	};
	// update keeps the thumbnail
	if (!(await table().update(p.id, rec)))
		await table().put({ id: p.id, ...rec });
}

/** Stores the open document even when it has no edit. */
export function saveOpen(): Promise<void> {
	const s = writeStore.get();
	if (s && current) pending = { id: current, doc: s.doc };
	return flush();
}

writeStore.subscribe(() => {
	const s = writeStore.get();
	if (writeStore.session() !== session) {
		session = writeStore.session();
		// previous document's last edit
		void flush();
		current = next ?? newId();
		next = null;
		last = s?.doc ?? null;
		return;
	}
	if (!s || !current || s.doc === last) return;
	last = s.doc;
	if (!canPersist()) return;
	pending = { id: current, doc: s.doc };
	clearTimeout(timer);
	timer = window.setTimeout(() => void flush(), DEBOUNCE);
});

// phones drop hidden pages
if (typeof document !== 'undefined')
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) void flush();
	});

export async function listDocs(): Promise<StoredDoc[]> {
	if (!canPersist()) return [];
	return table().orderBy('updatedAt').reverse().toArray();
}

export async function saveThumbnail(id: string, blob: Blob): Promise<void> {
	if (!canPersist()) return;
	await table()
		.where('id')
		.equals(id)
		.modify((rec) => {
			rec.thumbnail = blob;
		});
}

/** false when the record is missing; throws when it does not read. */
export async function openDoc(id: string): Promise<boolean> {
	if (id === current && writeStore.get()) return true;
	const rec = canPersist() ? await table().get(id) : null;
	if (!rec) return false;
	const doc = openAta(rec.ata);
	await ensureDocFonts(doc);
	next = id;
	writeStore.open(doc);
	return true;
}

export async function duplicateDoc(id: string): Promise<void> {
	if (!canPersist()) return;
	await (id === current ? saveOpen() : flush());
	const rec = await table().get(id);
	if (!rec) return;
	const doc = openAta(rec.ata);
	const name = uniqueName(
		rec.name,
		(await listDocs()).map((d) => d.name),
	);
	await table().put({
		...rec,
		id: newId(),
		name,
		ata: saveAta({ ...doc, name }),
		updatedAt: Date.now(),
	});
}

/** Deleting the open document closes it. */
export async function deleteDoc(id: string): Promise<void> {
	if (id === current) {
		clearTimeout(timer);
		pending = null;
		writeStore.close();
	}
	if (canPersist()) await table().delete(id);
}
