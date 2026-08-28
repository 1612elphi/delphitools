import { update, updateTransient } from './doc-store';
import { newId, type Guide, type SubstrataDoc } from './doc-model';

function write(
	mutator: (doc: SubstrataDoc) => SubstrataDoc,
	transient?: boolean,
): void {
	if (transient) updateTransient(mutator);
	else update(mutator);
}

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
