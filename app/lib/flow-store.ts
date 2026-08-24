import type Dexie from 'dexie';
import type { Table } from 'dexie';

// flow files use indexeddb

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
		// missing flag opens database
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

// webkit blob file workaround
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

export async function clearFlowFiles(run?: string): Promise<void> {
	if (!hasBag()) return;
	const database = await getDB();
	if (run) await database.files.where('run').equals(run).delete();
	else await database.files.clear();
	await syncFlag(database);
}

export async function sweepFlowFiles(alive: Set<string>): Promise<void> {
	if (!hasBag()) return;
	const database = await getDB();
	await database.files.filter((row) => !alive.has(row.run)).delete();
	await syncFlag(database);
}
