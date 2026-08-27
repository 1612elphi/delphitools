import {
	convertProse,
	scaleIngredient,
	type Display,
	type System,
} from './recipe-scale';
import type { Node, Op as TreeOp } from './recipe-table';

export type Id = string;

export interface Prep {
	id: Id;
	text: string;
}

export interface Ing {
	kind: 'ing';
	id: Id;
	text: string;
	prep: string;
	prepDetail: string[];
}

export interface Ref {
	kind: 'ref';
	id: Id;
	target: Id;
	note: string;
}

export type Input = Ing | Ref;

export interface Op {
	id: Id;
	label: string;
	detail: string[];
	discard: string[];
	result: string;
	inputs: Input[];
}

export interface Section {
	id: Id;
	name: string;
	ops: Op[];
}

export interface Doc {
	version: 1;
	title: string;
	serves: number | null;
	units: System | null;
	preps: Prep[];
	sections: Section[];
}

export interface Problem {
	id: Id;
	message: string;
}

export const newId = (): Id => crypto.randomUUID();

export const makePrep = (text = ''): Prep => ({ id: newId(), text });
export const makeIng = (
	text = '',
	prep = '',
	prepDetail: string[] = [],
): Ing => ({
	kind: 'ing',
	id: newId(),
	text,
	prep,
	prepDetail,
});
export const makeRef = (target: Id, note = ''): Ref => ({
	kind: 'ref',
	id: newId(),
	target,
	note,
});
export const makeOp = (label = ''): Op => ({
	id: newId(),
	label,
	detail: [],
	discard: [],
	result: '',
	inputs: [],
});
export const makeSection = (name = ''): Section => ({
	id: newId(),
	name,
	ops: [],
});
export const emptyDoc = (): Doc => ({
	version: 1,
	title: '',
	serves: null,
	units: null,
	preps: [],
	sections: [makeSection()],
});

// lookups

export function findSection(doc: Doc, id: Id): Section | undefined {
	return doc.sections.find((s) => s.id === id);
}

export function findOp(
	doc: Doc,
	id: Id,
): { section: Section; op: Op } | undefined {
	for (const section of doc.sections)
		for (const op of section.ops)
			if (op.id === id) return { section, op };
	return undefined;
}

export function findInput(
	doc: Doc,
	id: Id,
): { op: Op; input: Input } | undefined {
	for (const section of doc.sections)
		for (const op of section.ops)
			for (const input of op.inputs)
				if (input.id === id) return { op, input };
	return undefined;
}

export interface Target {
	id: Id;
	label: string;
	kind: 'section' | 'result';
}

// sections before this operation's section, and named results earlier in cooking order
export function targets(doc: Doc, opId: Id): Target[] {
	const out: Target[] = [];
	for (const section of doc.sections) {
		const index = section.ops.findIndex((op) => op.id === opId);
		if (index === -1) {
			if (section.name)
				out.push({
					id: section.id,
					label: section.name,
					kind: 'section',
				});
			for (const op of section.ops)
				if (op.result)
					out.push({
						id: op.id,
						label: op.result,
						kind: 'result',
					});
			continue;
		}
		for (const op of section.ops.slice(0, index))
			if (op.result)
				out.push({
					id: op.id,
					label: op.result,
					kind: 'result',
				});
		return out;
	}
	return out;
}

export function targetLabel(doc: Doc, id: Id): string {
	return findSection(doc, id)?.name ?? findOp(doc, id)?.op.result ?? '';
}

// immutable edits

const replace = <T>(list: T[], index: number, item: T): T[] =>
	list.map((x, i) => (i === index ? item : x));

const move = <T>(list: T[], from: number, to: number): T[] => {
	if (
		from === to ||
		from < 0 ||
		to < 0 ||
		from >= list.length ||
		to >= list.length
	)
		return list;
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item!);
	return next;
};

function updateSection(
	doc: Doc,
	id: Id,
	fn: (section: Section) => Section,
): Doc {
	const index = doc.sections.findIndex((s) => s.id === id);
	if (index === -1) return doc;
	return {
		...doc,
		sections: replace(
			doc.sections,
			index,
			fn(doc.sections[index]!),
		),
	};
}

function updateOp(doc: Doc, id: Id, fn: (op: Op) => Op): Doc {
	const found = findOp(doc, id);
	if (!found) return doc;
	return updateSection(doc, found.section.id, (section) => ({
		...section,
		ops: section.ops.map((op) => (op.id === id ? fn(op) : op)),
	}));
}

function updateInput(doc: Doc, id: Id, fn: (input: Input) => Input): Doc {
	const found = findInput(doc, id);
	if (!found) return doc;
	return updateOp(doc, found.op.id, (op) => ({
		...op,
		inputs: op.inputs.map((input) =>
			input.id === id ? fn(input) : input,
		),
	}));
}

export const setMeta = (
	doc: Doc,
	patch: Partial<Pick<Doc, 'title' | 'serves' | 'units'>>,
): Doc => ({ ...doc, ...patch });

export const addPrep = (doc: Doc): Doc => ({
	...doc,
	preps: [...doc.preps, makePrep()],
});
export const editPrep = (doc: Doc, id: Id, text: string): Doc => ({
	...doc,
	preps: doc.preps.map((p) => (p.id === id ? { ...p, text } : p)),
});
export const removePrep = (doc: Doc, id: Id): Doc => ({
	...doc,
	preps: doc.preps.filter((p) => p.id !== id),
});
export const movePrep = (doc: Doc, id: Id, delta: number): Doc => {
	const from = doc.preps.findIndex((p) => p.id === id);
	return { ...doc, preps: move(doc.preps, from, from + delta) };
};

export const addSection = (doc: Doc): Doc => ({
	...doc,
	sections: [...doc.sections, makeSection()],
});
export const renameSection = (doc: Doc, id: Id, name: string): Doc =>
	updateSection(doc, id, (s) => ({ ...s, name }));
export const removeSection = (doc: Doc, id: Id): Doc => {
	const sections = doc.sections.filter((s) => s.id !== id);
	return {
		...doc,
		sections: sections.length ? sections : [makeSection()],
	};
};
export const moveSection = (doc: Doc, id: Id, delta: number): Doc => {
	const from = doc.sections.findIndex((s) => s.id === id);
	return { ...doc, sections: move(doc.sections, from, from + delta) };
};
export const moveSectionTo = (doc: Doc, id: Id, to: number): Doc => {
	const from = doc.sections.findIndex((s) => s.id === id);
	return { ...doc, sections: move(doc.sections, from, to) };
};

export const addOp = (doc: Doc, sectionId: Id): Doc =>
	updateSection(doc, sectionId, (s) => ({
		...s,
		ops: [...s.ops, makeOp()],
	}));
export const editOp = (
	doc: Doc,
	id: Id,
	patch: Partial<Pick<Op, 'label' | 'detail' | 'discard' | 'result'>>,
): Doc => updateOp(doc, id, (op) => ({ ...op, ...patch }));
export const removeOp = (doc: Doc, id: Id): Doc => {
	const found = findOp(doc, id);
	if (!found) return doc;
	return updateSection(doc, found.section.id, (s) => ({
		...s,
		ops: s.ops.filter((op) => op.id !== id),
	}));
};
export const moveOp = (doc: Doc, id: Id, delta: number): Doc => {
	const found = findOp(doc, id);
	if (!found) return doc;
	const from = found.section.ops.indexOf(found.op);
	return updateSection(doc, found.section.id, (s) => ({
		...s,
		ops: move(s.ops, from, from + delta),
	}));
};
// into another section at an index; same section reorders
export const moveOpTo = (doc: Doc, id: Id, sectionId: Id, to: number): Doc => {
	const found = findOp(doc, id);
	if (!found) return doc;
	if (found.section.id === sectionId)
		return updateSection(doc, sectionId, (s) => ({
			...s,
			ops: move(s.ops, s.ops.indexOf(found.op), to),
		}));
	const without = removeOp(doc, id);
	return updateSection(without, sectionId, (s) => {
		const ops = [...s.ops];
		ops.splice(Math.min(to, ops.length), 0, found.op);
		return { ...s, ops };
	});
};

export const addIng = (doc: Doc, opId: Id): Doc =>
	updateOp(doc, opId, (op) => ({
		...op,
		inputs: [...op.inputs, makeIng()],
	}));
export const addRef = (doc: Doc, opId: Id, target: Id): Doc =>
	updateOp(doc, opId, (op) => ({
		...op,
		inputs: [...op.inputs, makeRef(target)],
	}));
export const editIng = (
	doc: Doc,
	id: Id,
	patch: Partial<Pick<Ing, 'text' | 'prep'>>,
): Doc =>
	updateInput(doc, id, (input) =>
		input.kind === 'ing' ? { ...input, ...patch } : input,
	);
export const editRef = (
	doc: Doc,
	id: Id,
	patch: Partial<Pick<Ref, 'target' | 'note'>>,
): Doc =>
	updateInput(doc, id, (input) =>
		input.kind === 'ref' ? { ...input, ...patch } : input,
	);
export const removeInput = (doc: Doc, id: Id): Doc => {
	const found = findInput(doc, id);
	if (!found) return doc;
	return updateOp(doc, found.op.id, (op) => ({
		...op,
		inputs: op.inputs.filter((input) => input.id !== id),
	}));
};
export const moveInput = (doc: Doc, id: Id, delta: number): Doc => {
	const found = findInput(doc, id);
	if (!found) return doc;
	const from = found.op.inputs.indexOf(found.input);
	return updateOp(doc, found.op.id, (op) => ({
		...op,
		inputs: move(op.inputs, from, from + delta),
	}));
};
export const moveInputTo = (doc: Doc, id: Id, opId: Id, to: number): Doc => {
	const found = findInput(doc, id);
	if (!found) return doc;
	if (found.op.id === opId)
		return updateOp(doc, opId, (op) => ({
			...op,
			inputs: move(
				op.inputs,
				op.inputs.indexOf(found.input),
				to,
			),
		}));
	const without = removeInput(doc, id);
	return updateOp(without, opId, (op) => {
		const inputs = [...op.inputs];
		inputs.splice(Math.min(to, inputs.length), 0, found.input);
		return { ...op, inputs };
	});
};

export const addDiscard = (doc: Doc, opId: Id): Doc =>
	updateOp(doc, opId, (op) => ({ ...op, discard: [...op.discard, ''] }));
export const editDiscard = (
	doc: Doc,
	opId: Id,
	index: number,
	text: string,
): Doc =>
	updateOp(doc, opId, (op) => ({
		...op,
		discard: replace(op.discard, index, text),
	}));
export const removeDiscard = (doc: Doc, opId: Id, index: number): Doc =>
	updateOp(doc, opId, (op) => ({
		...op,
		discard: op.discard.filter((_, i) => i !== index),
	}));

// validation the editor shows next to the entity

export function validate(doc: Doc): Problem[] {
	const problems: Problem[] = [];
	const referenced = new Set<Id>();
	const names = new Map<string, Id[]>();
	const note = (name: string, id: Id) => {
		if (!name) return;
		names.set(name, [...(names.get(name) ?? []), id]);
	};
	for (const section of doc.sections) {
		note(section.name, section.id);
		if (!section.ops.length)
			problems.push({
				id: section.id,
				message: 'no operations',
			});
		for (const op of section.ops) {
			note(op.result, op.id);
			if (!op.label.trim())
				problems.push({
					id: op.id,
					message: 'empty operation',
				});
			const reachable = new Set(
				targets(doc, op.id).map((t) => t.id),
			);
			for (const input of op.inputs) {
				if (input.kind !== 'ref') continue;
				referenced.add(input.target);
				if (!reachable.has(input.target))
					problems.push({
						id: input.id,
						message: 'unreachable target',
					});
			}
		}
	}
	doc.sections.slice(0, -1).forEach((section) => {
		if (section.ops.length && !referenced.has(section.id))
			problems.push({
				id: section.id,
				message: 'unused section',
			});
	});
	for (const ids of names.values())
		if (ids.length > 1)
			for (const id of ids)
				problems.push({
					id,
					message: 'duplicate name',
				});
	return problems;
}

// the table is a tree: the first reference to a section inlines it,
// every later reference and every named-result reference is a link row
export function toTree(doc: Doc): TreeOp | null {
	const inlined = new Set<Id>();
	const sectionIndex = new Map(doc.sections.map((s, i) => [s.id, i]));

	const leaf = (input: Ing): Node => {
		const ing: Node = { kind: 'ing', text: input.text };
		if (!input.prep) return ing;
		return {
			kind: 'op',
			id: `${input.id}:prep`,
			label: input.prep,
			detail: input.prepDetail,
			discard: [],
			name: '',
			children: [ing],
		};
	};

	const build = (section: Section, index: number): TreeOp | null => {
		let prev: TreeOp | null = null;
		for (const op of section.ops) {
			const node: TreeOp = {
				kind: 'op',
				id: op.id,
				label: op.label,
				detail: op.detail,
				discard: op.discard,
				name: op.result,
				children: [],
			};
			if (prev) node.children.push(prev);
			for (const input of op.inputs) {
				if (input.kind === 'ing') {
					node.children.push(leaf(input));
					continue;
				}
				const target = sectionIndex.get(input.target);
				if (
					target !== undefined &&
					target < index &&
					!inlined.has(input.target)
				) {
					inlined.add(input.target);
					const sub = build(
						doc.sections[target]!,
						target,
					);
					if (sub) {
						sub.name =
							doc.sections[
								target
							]!.name;
						node.children.push(sub);
					}
					continue;
				}
				const label = targetLabel(doc, input.target);
				if (label)
					node.children.push({
						kind: 'ref',
						name: label,
						note: input.note,
					});
			}
			prev = node;
		}
		return prev;
	};

	const last = doc.sections.length - 1;
	if (last < 0) return null;
	const root = build(doc.sections[last]!, last);
	if (root) root.name = '';
	return root;
}

export function factorFor(doc: Doc, amount: number): number {
	return doc.serves ? amount / doc.serves : amount;
}

// every text field scaled and converted; serves and units rewritten
export function present(
	doc: Doc,
	factor: number,
	display: Display,
	amount: number,
): Doc {
	const prose = (text: string) => convertProse(text, display);
	const ing = (text: string) => scaleIngredient(text, factor, display);
	return {
		...doc,
		serves: doc.serves ? amount : doc.serves,
		units: display === 'written' ? doc.units : display,
		preps: doc.preps.map((p) => ({ ...p, text: prose(p.text) })),
		sections: doc.sections.map((section) => ({
			...section,
			ops: section.ops.map((op) => ({
				...op,
				label: prose(op.label),
				detail: op.detail.map(prose),
				inputs: op.inputs.map((input) =>
					input.kind === 'ing'
						? {
								...input,
								text: ing(
									input.text,
								),
								prep: prose(
									input.prep,
								),
							}
						: {
								...input,
								note: ing(
									input.note,
								),
							},
				),
			})),
		})),
	};
}
