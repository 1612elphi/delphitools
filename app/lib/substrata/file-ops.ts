import { fileOpen, fileSave } from 'browser-fs-access';
import {
	createEmptyDoc,
	DEFAULT_ARTBOARD,
	newId,
	type Artboard,
	type SubstrataDoc,
} from './doc-model';
import { getSnapshot, setDoc } from './doc-store';
import { leafLayers } from './layer-tree';
import { openModal } from './modal';
import { viewport } from './viewport';
import { packSubstrata, unpackSubstrata } from './substrata-file';
import { slugifySceneName } from './export-core';
import { loadProject, persistAll } from './autosave';
import { getPersistenceEnabled } from './persistence-pref';
import { toast } from './toast';

let handle: FileSystemFileHandle | null = null;

function sceneFileName(doc: SubstrataDoc): string {
	return `${slugifySceneName(doc.name)}.substrata`;
}

function confirmDiscard(): boolean {
	const doc = getSnapshot();
	if (!doc || (doc.layers.length === 0 && doc.guides.length === 0))
		return true;
	return window.confirm('Replace this? Unsaved work is lost.');
}

// saving on: no confirm
export function startBlank(): void {
	if (getPersistenceEnabled() || !getSnapshot()) openModal('new-scene');
	else newScene();
}

export function newScene(): void {
	if (!confirmDiscard()) return;
	openModal('new-scene');
}

export function createScene(artboard: Artboard): void {
	handle = null;
	setDoc(createEmptyDoc('', artboard));
}

export function ensureScene(): void {
	if (getSnapshot()) return;
	createScene({ ...DEFAULT_ARTBOARD });
	viewport.fit();
}

export function openLoaded(doc: SubstrataDoc): void {
	handle = null;
	setDoc(doc);
}

export async function openRecent(id: string): Promise<void> {
	const current = getSnapshot();
	if (current?.id === id) return;
	if (!confirmDiscard()) return;
	const doc = await loadProject(id);
	if (!doc) {
		toast('open-failed');
		return;
	}
	openLoaded(doc);
}

export async function openScene(): Promise<void> {
	if (!confirmDiscard()) return;
	let file: File & { handle?: FileSystemFileHandle };
	try {
		file = await fileOpen({
			extensions: ['.substrata'],
			description: 'Substrata scene',
		});
	} catch {
		return;
	}
	let doc: SubstrataDoc;
	try {
		doc = await unpackSubstrata(await file.arrayBuffer());
	} catch {
		toast('open-failed');
		return;
	}
	handle = file.handle ?? null;
	setDoc(doc);
	if (getPersistenceEnabled()) void persistAll(doc);
}

export async function saveScene(asCopy = false): Promise<void> {
	const doc = getSnapshot();
	if (!doc) return;
	const blob = await packSubstrata(doc);
	try {
		const saved = await fileSave(
			blob,
			{
				fileName: sceneFileName(doc),
				extensions: ['.substrata'],
				description: 'Substrata scene',
			},
			asCopy ? null : handle,
		);
		if (!asCopy && saved) handle = saved;
		toast('saved');
	} catch {}
}

export function saveTemplate(): void {
	const doc = getSnapshot();
	if (!doc) return;
	if (doc.layers.some((l) => leafLayers(l).some((leaf) => leaf.stratum)))
		void saveScene(true);
	else openModal('strata-help');
}

export interface TemplateEntry {
	file: string;
	name: string;
	thumb: string | null;
	width: number;
	height: number;
}

const TEMPLATES = '/substrata/templates/';

let templates: Promise<TemplateEntry[]> | null = null;

export function listTemplates(): Promise<TemplateEntry[]> {
	// retry failed fetches
	templates ??= fetchTemplates().then((list) => {
		if (!list.length) templates = null;
		return list;
	});
	return templates;
}

async function fetchTemplates(): Promise<TemplateEntry[]> {
	try {
		const res = await fetch(`${TEMPLATES}index.json`);
		if (!res.ok) return [];
		return (await res.json()) as TemplateEntry[];
	} catch {
		return [];
	}
}

export function templateUrl(path: string): string {
	return TEMPLATES + path;
}

// fresh id per open
export async function openTemplate(entry: TemplateEntry): Promise<boolean> {
	if (!getPersistenceEnabled() && !confirmDiscard()) return false;
	let doc: SubstrataDoc;
	try {
		const res = await fetch(templateUrl(entry.file));
		if (!res.ok) throw new Error(String(res.status));
		doc = await unpackSubstrata(await res.arrayBuffer());
	} catch {
		toast('open-failed');
		return false;
	}
	const now = Date.now();
	doc = { ...doc, id: newId(), createdAt: now, updatedAt: now };
	openLoaded(doc);
	if (getPersistenceEnabled()) void persistAll(doc);
	return true;
}
