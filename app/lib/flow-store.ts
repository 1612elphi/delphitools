import type Dexie from 'dexie';
import type { Table } from 'dexie';

/**
 * The bag of files a workflow carries between steps. IndexedDB because
 * sessionStorage holds strings under a 5 MB quota; a trimmed video does not
 * fit. The database is per origin, not per tab, so every row carries the run
 * id of the flow that wrote it: a tab reads and clears its own run, and a
 * boot-time sweep (flow service) deletes the runs no live tab answers for.
 * A localStorage flag says whether any rows exist, so a visitor who never
 * used a flow never opens the database, and Dexie (32 kB gzipped) loads on
 * the first write, not at boot.
 */

const BAG_FLAG = 'flow-bag';

interface FlowRow {
	id?: number;
	run: string;
	step: number;
	name: string;
	type: string;
	blob: Blob;
}

export interface FlowFile {
	id: number;
	/** the step that produced it */
	step: number;
	file: File;
}

type FlowDB = Dexie & { files: Table<FlowRow, number> };

let db: Promise<FlowDB> | null = null;

function getDB(): Promise<FlowDB> {
	db ??= import('dexie').then(({ default: Dexie }) => {
		const database = new Dexie('flow') as FlowDB;
		database.version(1).stores({ files: '++id, step' });
		database.version(2).stores({ files: '++id, step, run' });
		return database;
	});
	return db;
}

export const hasFlowStore = () => typeof indexedDB !== 'undefined';

/** rows may exist (set after a write, cleared when the last row goes) */
export function hasBag(): boolean {
	try {
		return localStorage.getItem(BAG_FLAG) !== null;
	} catch {
		return false;
	}
}

async function syncFlag(database: FlowDB): Promise<void> {
	const rows = await database.files.count();
	try {
		if (rows > 0) localStorage.setItem(BAG_FLAG, '1');
		else localStorage.removeItem(BAG_FLAG);
	} catch {
		// storage blocked: the next boot opens the database regardless
	}
}

export async function addFlowFile(
	run: string,
	step: number,
	file: File,
): Promise<FlowFile> {
	const database = await getDB();
	const id = await database.files.add({
		run,
		step,
		name: file.name,
		type: file.type,
		blob: file,
	});
	await syncFlag(database);
	return { id, step, file };
}

// WebKit handed File values back as Blob (bug 208351), so name and type are
// their own columns and the File is rebuilt on read.
export async function allFlowFiles(run: string): Promise<FlowFile[]> {
	if (!hasBag()) return [];
	const rows = await (
		await getDB()
	).files
		.where('run')
		.equals(run)
		.toArray();
	return rows.map(({ id, step, name, type, blob }) => ({
		id: id!,
		step,
		file: new File([blob], name, { type }),
	}));
}

/** one run's rows, or every row when no run is given */
export async function clearFlowFiles(run?: string): Promise<void> {
	if (!hasBag()) return;
	const database = await getDB();
	if (run) await database.files.where('run').equals(run).delete();
	else await database.files.clear();
	await syncFlag(database);
}

/** rows of runs no live tab claims (rows from the v1 schema have no run and go too) */
export async function sweepFlowFiles(alive: Set<string>): Promise<void> {
	if (!hasBag()) return;
	const database = await getDB();
	await database.files.filter((row) => !alive.has(row.run)).delete();
	await syncFlag(database);
}
