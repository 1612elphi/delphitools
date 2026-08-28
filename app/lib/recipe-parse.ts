import type { System } from './recipe-scale';

export interface Ingredient {
	kind: 'ing';
	name: string;
	quantity: string;
	detail: string[];
}

export interface Reference {
	kind: 'ref';
	name: string;
	detail: string[];
	line: number;
}

export interface Chained {
	kind: 'step';
	step: Step;
}

export type Input = Ingredient | Reference | Chained;

export interface Step {
	label: string;
	detail: string[];
	inputs: Input[];
	discard: string[];
	name: string;
	marks: number[];
	line: number;
}

export interface Problem {
	line: number;
	message: string;
}

export interface Recipe {
	title: string;
	serves: number | null;
	units: System | null;
	banners: string[];
	notes: string[];
	root: Step | null;
	problems: Problem[];
}

const META = /^(title|serves|units)\s*:\s*(.*)$/i;
const DISCARD = /^x(\s|$)/;
const PREP = ' / ';

const fields = (text: string) => text.split('|').map((part) => part.trim());
const detail = (rest: string[]) => rest.filter(Boolean);

const makeStep = (label: string, rest: string[], line: number): Step => ({
	label,
	detail: detail(rest),
	inputs: [],
	discard: [],
	name: '',
	marks: [],
	line,
});

interface Chain {
	steps: Step[];
	line: number;
}

// grammar: clarascript-reference.pdf
export function parse(text: string): Recipe {
	const problems: Problem[] = [];
	const banners: string[] = [];
	const notes: string[] = [];
	const chains: Chain[] = [];
	const named = new Map<string, { step: Step; chain: Chain }>();
	const consumed = new Set<Chain>();

	let title = '';
	let serves: number | null = null;
	let units: System | null = null;
	let chain: Chain | null = null;
	let step: Step | null = null;
	let started = false;
	let pending: number[] = [];

	const attach = (line: number): Step | null => {
		if (step) return step;
		problems.push({ line, message: 'no step above' });
		return null;
	};

	text.split('\n').forEach((raw, index) => {
		const body = raw.trim();
		const line = index + 1;

		if (!body) {
			chain = null;
			step = null;
			return;
		}

		if (body.startsWith('>')) {
			const note = body.slice(1).trim();
			if (!note) return;
			if (!started) {
				banners.push(note);
				return;
			}
			notes.push(note);
			pending.push(notes.length);
			return;
		}

		const meta = !started && body.match(META);
		if (meta) {
			const key = meta[1]!.toLowerCase();
			const raw = meta[2]!.trim();
			if (key === 'title') title = raw;
			else if (key === 'serves') {
				const n = Number.parseFloat(raw);
				serves = Number.isFinite(n) && n > 0 ? n : null;
			} else if (raw === 'metric' || raw === 'imperial')
				units = raw;
			return;
		}

		if (body.startsWith('-')) {
			const owner = attach(line);
			if (!owner) return;
			const rest = body.slice(1).trim();
			const cut = rest.indexOf(PREP);
			const [head = '', ...extra] = fields(
				cut < 0 ? rest : rest.slice(0, cut),
			);
			const colon = head.indexOf(':');
			const ing: Ingredient = {
				kind: 'ing',
				name: (colon < 0
					? head
					: head.slice(0, colon)
				).trim(),
				quantity:
					colon < 0
						? ''
						: head.slice(colon + 1).trim(),
				detail: detail(extra),
			};
			if (cut < 0) {
				owner.inputs.push(ing);
				return;
			}
			const [label = '', ...prepDetail] = fields(
				rest.slice(cut + PREP.length),
			);
			const prep = makeStep(label, prepDetail, line);
			prep.inputs.push(ing);
			owner.inputs.push({ kind: 'step', step: prep });
			return;
		}

		if (body.startsWith('@')) {
			const owner = attach(line);
			if (!owner) return;
			const [name = '', ...note] = fields(
				body.slice(1).trim(),
			);
			const target = named.get(name);
			if (!target) {
				problems.push({
					line,
					message: `unknown name: ${name}`,
				});
				return;
			}
			const last =
				target.chain.steps[
					target.chain.steps.length - 1
				];
			if (
				target.chain !== chain &&
				target.step === last &&
				!consumed.has(target.chain)
			) {
				consumed.add(target.chain);
				owner.inputs.push({
					kind: 'step',
					step: target.step,
				});
				return;
			}
			owner.inputs.push({
				kind: 'ref',
				name,
				detail: detail(note),
				line,
			});
			return;
		}

		if (DISCARD.test(body)) {
			const owner = attach(line);
			if (!owner) return;
			const text = body.slice(1).trim();
			if (text) owner.discard.push(text);
			return;
		}

		if (body.startsWith('=')) {
			const owner = attach(line);
			if (!owner) return;
			const name = body.slice(1).trim();
			if (!name) return;
			if (named.has(name))
				problems.push({
					line,
					message: `duplicate name: ${name}`,
				});
			owner.name = name;
			named.set(name, { step: owner, chain: chain! });
			return;
		}

		started = true;
		const [label = '', ...rest] = fields(body);
		const next = makeStep(label, rest, line);
		next.marks = pending;
		pending = [];
		if (!chain) {
			chain = { steps: [], line };
			chains.push(chain);
		}
		if (step) next.inputs.push({ kind: 'step', step });
		chain.steps.push(next);
		step = next;
	});

	const root = chains[chains.length - 1];
	for (const other of chains)
		if (other !== root && !consumed.has(other))
			problems.push({
				line: other.line,
				message: 'unused chain',
			});

	return {
		title,
		serves,
		units,
		banners,
		notes,
		root: root ? (root.steps[root.steps.length - 1] ?? null) : null,
		problems,
	};
}
