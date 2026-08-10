/**
 * Guide mutations (rulers pass, 2026-07-07) — the action layer over the doc
 * store for ruler guidelines. Same template as artboard-ops: everything goes
 * through `update()` so add/move/remove are single undoable steps; a drag
 * brackets `beginTransient`/`commitTransient` and passes `{ transient: true }`
 * so the whole gesture coalesces to ONE step (the layer-ops convention).
 */

import { update, updateTransient } from './doc-store';
import { newId, type Guide, type SubstrataDoc } from './doc-model';

function write(
	mutator: (doc: SubstrataDoc) => SubstrataDoc,
	transient?: boolean,
): void {
	if (transient) updateTransient(mutator);
	else update(mutator);
}

/** Drop a new guide. Undoable. Returns its id (the drag handle). */
export function addGuide(axis: Guide['axis'], pos: number): string {
	const id = newId();
	update((doc) => ({
		...doc,
		guides: [...doc.guides, { id, axis, pos }],
		updatedAt: Date.now(),
	}));
	return id;
}

export function setGuidePos(
	id: string,
	pos: number,
	opts?: { transient?: boolean },
): void {
	write(
		(doc) => ({
			...doc,
			guides: doc.guides.map((g) =>
				g.id === id ? { ...g, pos } : g,
			),
			updatedAt: Date.now(),
		}),
		opts?.transient,
	);
}

export function removeGuide(id: string, opts?: { transient?: boolean }): void {
	write(
		(doc) => ({
			...doc,
			guides: doc.guides.filter((g) => g.id !== id),
			updatedAt: Date.now(),
		}),
		opts?.transient,
	);
}
