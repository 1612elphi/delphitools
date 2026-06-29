/**
 * Substrata local persistence (M0-8 / M1-9). Dexie over raw idb for declarative
 * versioned migrations (§5). Stores per §9/§13:
 *   - projects   doc JSON + thumbnail, indexed by updatedAt/name
 *   - blobs      content-addressed by SHA-256, ref-counted
 *   - handles    File System Access handles (Chromium reopen)
 *   - snapshots  best-effort recovery cache
 *
 * Hard rules carried from the spec:
 *   - The exported .substrata file is the durable source of truth; this store is
 *     a best-effort autosave/recovery cache only (§5). Never claim "crash-proof".
 *   - Future schema versions MUST migrate non-destructively (§13) — add a new
 *     version(n).upgrade(), never rewrite saved data in a lossy way.
 *   - Lazy, browser-only: Dexie is never instantiated during the static-export
 *     prerender (it needs IndexedDB).
 */

import Dexie, { type Table } from "dexie";
import type { SubstrataDoc } from "./doc-model";

export interface ProjectRecord {
  id: string;
  name: string;
  doc: SubstrataDoc;
  thumbnail?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface BlobRecord {
  /** SHA-256 hex of `blob` */
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

export class SubstrataDB extends Dexie {
  projects!: Table<ProjectRecord, string>;
  blobs!: Table<BlobRecord, string>;
  handles!: Table<HandleRecord, string>;
  snapshots!: Table<SnapshotRecord, string>;

  constructor() {
    super("substrata");
    // v1 — establishes the schema. Index only what we query on; the heavy doc
    // JSON / blobs are stored values, not indexes.
    this.version(1).stores({
      projects: "id, name, updatedAt",
      blobs: "hash, refCount, createdAt",
      handles: "id, updatedAt",
      snapshots: "id, projectId, createdAt",
    });
  }
}

let _db: SubstrataDB | null = null;

/**
 * Lazy client-only accessor. Throws in non-browser contexts so an accidental
 * prerender-time call fails loudly instead of corrupting the static export.
 */
export function getDB(): SubstrataDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("SubstrataDB requires a browser (IndexedDB) context");
  }
  if (!_db) _db = new SubstrataDB();
  return _db;
}
