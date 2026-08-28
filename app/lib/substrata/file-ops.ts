import { fileOpen, fileSave } from 'browser-fs-access';
import {
	createEmptyDoc,
	DEFAULT_ARTBOARD,
	type Artboard,
	type SubstrataDoc,
} from './doc-model';
import { getSnapshot, setDoc } from './doc-store';
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

export async function openRecent(id: string): Promise<void> {
	const current = getSnapshot();
	if (current?.id === id) return;
	if (!confirmDiscard()) return;
	const doc = await loadProject(id);
	if (!doc) {
		toast('open-failed');
		return;
	}
	handle = null;
	setDoc(doc);
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
	} catch {
	}
}
