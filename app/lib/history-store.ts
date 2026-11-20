// unbound: property syntax
export interface HistoryStore<T> {
	getSnapshot: () => T | null;
	subscribe: (listener: () => void) => () => void;
	setDoc: (next: T | null) => void;
	update: (mutator: (doc: T) => T) => void;
	isGestureActive: () => boolean;
	beginTransient: () => void;
	updateTransient: (mutator: (doc: T) => T) => void;
	rollbackTransient: () => void;
	commitTransient: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
	undo: () => void;
	redo: () => void;
	/** all reachable states, current included */
	states: () => T[];
	/** While off, changes leave no undo states. */
	record: (on: boolean) => void;
}

const HISTORY_LIMIT = 100;

export function createHistoryStore<T>(): HistoryStore<T> {
	let state: T | null = null;
	let transientBase: T | null = null;
	const undoStack: T[] = [];
	const redoStack: T[] = [];
	const listeners = new Set<() => void>();
	let recording = true;

	const emit = () => {
		for (const l of listeners) l();
	};
	const pushUndo = (previous: T) => {
		if (!recording) return;
		undoStack.push(previous);
		if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
		redoStack.length = 0;
	};
	const isGestureActive = () => transientBase !== null;

	return {
		getSnapshot: () => state,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setDoc(next) {
			state = next;
			undoStack.length = 0;
			redoStack.length = 0;
			emit();
		},
		update(mutator) {
			if (!state) return;
			const previous = state;
			const next = mutator(previous);
			// skip no-op undo states
			if (next === previous) return;
			pushUndo(previous);
			state = next;
			emit();
		},
		isGestureActive,
		beginTransient() {
			transientBase = state;
		},
		updateTransient(mutator) {
			if (!state) return;
			state = mutator(state);
			emit();
		},
		rollbackTransient() {
			if (transientBase === null) return;
			state = transientBase;
			transientBase = null;
			emit();
		},
		commitTransient() {
			const base = transientBase;
			transientBase = null;
			// settle transient renders
			emit();
			if (!state || !base || state === base) return;
			pushUndo(base);
		},
		states: () =>
			[
				state,
				transientBase,
				...undoStack,
				...redoStack,
			].filter((s): s is T => s !== null),
		record(on) {
			recording = on;
		},
		canUndo: () => undoStack.length > 0,
		canRedo: () => redoStack.length > 0,
		undo() {
			// defer undo during gestures
			if (
				!state ||
				undoStack.length === 0 ||
				isGestureActive()
			)
				return;
			redoStack.push(state);
			state = undoStack.pop()!;
			emit();
		},
		redo() {
			if (
				!state ||
				redoStack.length === 0 ||
				isGestureActive()
			)
				return;
			undoStack.push(state);
			state = redoStack.pop()!;
			emit();
		},
	};
}
