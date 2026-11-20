import { channel } from 'delphitools-v2/lib/channel';
import { releaseBitmaps } from './image';
import { normaliseDoc, paraText, tidyImages, tidyNotes } from './model';
import type { Selection, WriteDoc } from './types';

export interface WriteState {
	doc: WriteDoc;
	sel: Selection;
}

export type CommitKind = 'type' | 'delete' | 'format' | 'other';

const LIMIT = 200;

// snapshots keep own images
function normalised(prev: WriteState, s: WriteState): WriteState {
	s = tidyNotes(prev.doc, tidyImages(prev.doc, s));
	const doc = normaliseDoc(s.doc);
	for (const [id, asset] of Object.entries(prev.doc.images ?? {}))
		if (doc.images?.[id] !== asset) releaseBitmaps(asset);
	return doc === s.doc ? s : { ...s, doc };
}
const MERGE_MS = 1000;

function typedSpace({ doc, sel }: WriteState): boolean {
	const b = doc.blocks[sel.focus.block];
	if (b?.kind !== 'para' || sel.focus.offset === 0) return true;
	return /\s/.test(paraText(b)[sel.focus.offset - 1]!);
}

export function createWriteStore(now: () => number = Date.now) {
	const state = channel<WriteState | null>(null);
	let past: WriteState[] = [];
	let future: WriteState[] = [];
	// next type commit merges
	let merging = false;
	let lastAt = 0;
	let session = 0;

	const restore = (from: WriteState[], to: WriteState[]) => {
		const cur = state.get();
		const prev = from.pop();
		if (!cur || !prev) return;
		to.push(cur);
		merging = false;
		state.set(prev);
	};

	const reset = (next: WriteState | null) => {
		past = [];
		future = [];
		merging = false;
		state.set(next);
	};

	return {
		get: state.get,
		subscribe: state.subscribe,
		/** counts opened documents */
		session: () => session,
		open(doc: WriteDoc) {
			session++;
			const start = { block: 0, offset: 0 };
			reset({
				doc: normaliseDoc(doc),
				sel: { anchor: start, focus: start },
			});
		},
		close: () => reset(null),
		// same doc moves selection
		commit(next: WriteState, kind: CommitKind) {
			const cur = state.get();
			if (!cur) return;
			next = normalised(cur, next);
			const t = now();
			if (next.doc === cur.doc) {
				merging = false;
				state.set(next);
				return;
			}
			if (!(
				kind === 'type' &&
				merging &&
				t - lastAt < MERGE_MS
			)) {
				past.push(cur);
				if (past.length > LIMIT) past.shift();
			}
			future = [];
			merging = kind === 'type' && !typedSpace(next);
			lastAt = t;
			state.set(next);
		},
		/** no new undo step */
		amend(next: WriteState) {
			const cur = state.get();
			if (!cur) return;
			future = [];
			merging = false;
			state.set(normalised(cur, next));
		},
		breakMerge() {
			merging = false;
		},
		undo: () => restore(past, future),
		redo: () => restore(future, past),
		canUndo: () => past.length > 0,
		canRedo: () => future.length > 0,
	};
}

export const writeStore = createWriteStore();
