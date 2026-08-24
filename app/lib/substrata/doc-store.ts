import type { SubstrataDoc } from './doc-model';

type Listener = () => void;

const HISTORY_LIMIT = 100;

let state: SubstrataDoc | null = null;
const undoStack: SubstrataDoc[] = [];
const redoStack: SubstrataDoc[] = [];
const listeners = new Set<Listener>();

function emit(): void {
	for (const l of listeners) l();
}

export function getSnapshot(): SubstrataDoc | null {
	return state;
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function setDoc(next: SubstrataDoc | null): void {
	state = next;
	undoStack.length = 0;
	redoStack.length = 0;
	emit();
}

export function update(mutator: (doc: SubstrataDoc) => SubstrataDoc): void {
	if (!state) return;
	const previous = state;
	const next = mutator(previous);
	// skip no-op undo states
	if (next === previous) return;
	undoStack.push(previous);
	if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
	redoStack.length = 0;
	state = next;
	emit();
}

let transientBase: SubstrataDoc | null = null;

export function isGestureActive(): boolean {
	return transientBase !== null;
}

export function beginTransient(): void {
	transientBase = state;
}

export function updateTransient(
	mutator: (doc: SubstrataDoc) => SubstrataDoc,
): void {
	if (!state) return;
	state = mutator(state);
	emit();
}

export function rollbackTransient(): void {
	if (transientBase === null) return;
	state = transientBase;
	transientBase = null;
	emit();
}

export function commitTransient(): void {
	const base = transientBase;
	transientBase = null;
	// settle transient renders
	emit();
	if (!state || !base || state === base) return;
	undoStack.push(base);
	if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
	redoStack.length = 0;
}

export function canUndo(): boolean {
	return undoStack.length > 0;
}

export function canRedo(): boolean {
	return redoStack.length > 0;
}

export function undo(): void {
	// defer undo during gestures
	if (!state || undoStack.length === 0 || isGestureActive()) return;
	redoStack.push(state);
	state = undoStack.pop()!;
	emit();
}

export function redo(): void {
	if (!state || redoStack.length === 0 || isGestureActive()) return;
	undoStack.push(state);
	state = redoStack.pop()!;
	emit();
}
