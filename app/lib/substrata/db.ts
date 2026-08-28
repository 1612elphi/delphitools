import Dexie, { type Table } from 'dexie';
import type { SubstrataDoc } from './doc-model';

export interface ProjectRecord {
	id: string;
	name: string;
	doc: SubstrataDoc;
	thumbnail?: Blob;
	createdAt: number;
	updatedAt: number;
}

export interface BlobRecord {
	hash: string;
	blob: Blob;
	refCount: number;
	createdAt: number;
}

export interface HandleRecord {
	id: string;
	name: string;
	handle: FileSystemFileHandle;
	updatedAt: number;
}

export interface SnapshotRecord {
	id: string;
	projectId: string;
	doc: SubstrataDoc;
	createdAt: number;
}

export interface MatteRecord {
	/** source raster hash */
	hash: string;
	/** alpha-channel png */
	blob: Blob;
	createdAt: number;
}

export class SubstrataDB extends Dexie {
	projects!: Table<ProjectRecord, string>;
	blobs!: Table<BlobRecord, string>;
	handles!: Table<HandleRecord, string>;
	snapshots!: Table<SnapshotRecord, string>;
	mattes!: Table<MatteRecord, string>;

	constructor() {
		super('substrata');
		// queried fields only
		this.version(1).stores({
			projects: 'id, name, updatedAt',
			blobs: 'hash, refCount, createdAt',
			handles: 'id, updatedAt',
			snapshots: 'id, projectId, createdAt',
		});
		// document schema v2
		this.version(2).stores({});
		// cached alpha mattes
		this.version(3).stores({ mattes: 'hash' });
	}
}

let _db: SubstrataDB | null = null;

export function getDB(): SubstrataDB {
	if (typeof indexedDB === 'undefined') {
		throw new Error(
			'SubstrataDB requires a browser (IndexedDB) context',
		);
	}
	if (!_db) _db = new SubstrataDB();
	return _db;
}
