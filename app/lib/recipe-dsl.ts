import {
	makeIng,
	makeOp,
	makePrep,
	makeRef,
	makeSection,
	type Doc,
	type Id,
	type Op,
	type Section,
} from './recipe-doc';

export interface Diagnostic {
	line: number;
	message: string;
}

const META_LINE = /^(title|serves|units)\s*:\s*(.*)$/i;
const DISCARD = /^x(\s|$)/i;

// flat, in cooking order: `title:`/`serves:`/`units:`, `>` prep, `## name` section,
// `label (refs) = result | detail`, `- ingredient | prep | detail`, `x discarded output`
export function parse(text: string): { doc: Doc; errors: Diagnostic[] } {
	const errors: Diagnostic[] = [];
	const doc: Doc = {
		version: 1,
		title: '',
		serves: null,
		units: null,
		preps: [],
		sections: [],
	};
	// references are by name in the text; resolve against what precedes the line
	const known = new Map<string, Id>();
	let section: Section = makeSection();
	let last: Op | null = null;
	const pending: { op: Op; line: number; names: [string, string][] }[] =
		[];

	const closeSection = () => {
		if (section.ops.length || section.name) {
			doc.sections.push(section);
			if (section.name) known.set(section.name, section.id);
		}
	};

	text.split('\n').forEach((raw, index) => {
		const line = raw.trim();
		const n = index + 1;
		if (!line) return;

		const meta = line.match(META_LINE);
		if (meta) {
			const key = meta[1]!.toLowerCase();
			const value = meta[2]!.trim();
			if (key === 'title') doc.title = value;
			else if (key === 'serves') {
				const serves = Number.parseFloat(value);
				doc.serves =
					Number.isFinite(serves) && serves > 0
						? serves
						: null;
			} else if (value === 'metric' || value === 'imperial')
				doc.units = value;
			return;
		}
		if (line.startsWith('>')) {
			doc.preps.push(makePrep(line.slice(1).trim()));
			return;
		}
		if (line.startsWith('##')) {
			closeSection();
			section = makeSection(line.slice(2).trim());
			last = null;
			return;
		}
		if (line.startsWith('-') || DISCARD.test(line)) {
			if (!last) {
				errors.push({
					line: n,
					message: 'no operation above',
				});
				return;
			}
			const body = line.slice(1).trim();
			if (DISCARD.test(line)) {
				last.discard.push(body);
				return;
			}
			const [ingredient = '', prep = '', ...detail] = body
				.split('|')
				.map((s) => s.trim());
			last.inputs.push(
				makeIng(
					ingredient,
					prep,
					detail.filter(Boolean),
				),
			);
			return;
		}

		const [labelPart = '', ...detail] = line
			.split('|')
			.map((s) => s.trim());
		let label = labelPart;
		let result = '';
		const eq = label.lastIndexOf('=');
		if (eq >= 0) {
			result = label.slice(eq + 1).trim();
			label = label.slice(0, eq).trim();
		}
		const op = makeOp(label);
		op.detail = detail.filter(Boolean);
		op.result = result;
		const group = label.match(/\(([^()]*)\)\s*$/);
		if (group) {
			const names: [string, string][] = group[1]!
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
				.map((part) => {
					const colon = part.indexOf(':');
					return colon < 0
						? [part, '']
						: [
								part
									.slice(
										0,
										colon,
									)
									.trim(),
								part
									.slice(
										colon +
											1,
									)
									.trim(),
							];
				});
			const resolvable = names.some(
				([name]) =>
					known.has(name) ||
					name === section.name,
			);
			if (resolvable) {
				op.label = label.slice(0, group.index).trim();
				pending.push({ op, line: n, names });
			}
		}
		if (result) known.set(result, op.id);
		section.ops.push(op);
		last = op;
	});
	closeSection();
	if (!doc.sections.length) doc.sections.push(makeSection());

	// a reference to the open section is the chain itself; unknown names are errors
	for (const { op, line, names } of pending) {
		const own = doc.sections.find((s) => s.ops.includes(op));
		const refs = [];
		for (const [name, note] of names) {
			if (name === own?.name) continue;
			const target = known.get(name);
			if (!target || target === op.id) {
				errors.push({
					line,
					message: 'unknown section',
				});
				continue;
			}
			refs.push(makeRef(target, note));
		}
		op.inputs.unshift(...refs);
	}
	return { doc, errors };
}

const nameOf = (doc: Doc, id: Id): string =>
	doc.sections.find((s) => s.id === id)?.name ??
	doc.sections.flatMap((s) => s.ops).find((op) => op.id === id)?.result ??
	'';

export function serialize(doc: Doc): string {
	const lines: string[] = [];
	if (doc.title) lines.push(`title: ${doc.title}`);
	if (doc.serves) lines.push(`serves: ${doc.serves}`);
	if (doc.units) lines.push(`units: ${doc.units}`);
	if (doc.preps.length) {
		if (lines.length) lines.push('');
		for (const prep of doc.preps)
			if (prep.text.trim())
				lines.push(`> ${prep.text.trim()}`);
	}
	doc.sections.forEach((section, index) => {
		if (section.name || index > 0) {
			if (lines.length) lines.push('');
			lines.push(`## ${section.name}`.trimEnd());
		}
		section.ops.forEach((op, opIndex) => {
			if (
				opIndex > 0 ||
				(!section.name && index === 0 && lines.length)
			)
				lines.push('');
			const refs = op.inputs
				.filter((input) => input.kind === 'ref')
				.map((ref) => {
					const name = nameOf(doc, ref.target);
					return ref.note
						? `${name}: ${ref.note}`
						: name;
				})
				.filter(Boolean);
			let head = op.label.trim();
			if (refs.length) head += ` (${refs.join(', ')})`;
			if (op.result.trim()) head += ` = ${op.result.trim()}`;
			lines.push(
				[
					head,
					...op.detail
						.map((d) => d.trim())
						.filter(Boolean),
				].join(' | '),
			);
			for (const input of op.inputs) {
				if (input.kind !== 'ing') continue;
				const parts = [input.text.trim()];
				if (input.prep.trim())
					parts.push(
						input.prep.trim(),
						...input.prepDetail,
					);
				lines.push(`- ${parts.join(' | ')}`);
			}
			for (const discard of op.discard)
				if (discard.trim())
					lines.push(`x ${discard.trim()}`);
		});
	});
	return lines.join('\n');
}
