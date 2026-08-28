import type { Cell, Grid, Rendered } from './recipe-layout';

const escape = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

const numbered = (notes: string[]) =>
	notes.map((note, i) => `${i + 1}. ${note}`);

const listed = (items: Rendered['ingredients']) =>
	items.map((item) =>
		item.amount ? `${item.name}: ${item.amount}` : item.name,
	);

const head = (cell: Cell) => {
	if (cell.kind === 'ref') return `↩ ${cell.text}`;
	if (cell.marks.length) return `(${cell.marks.join(', ')}) ${cell.text}`;
	return cell.text;
};

interface Part {
	cls: string;
	text: string;
}

const parts = (cell: Cell): Part[] =>
	[
		{ cls: 'l', text: head(cell) },
		...cell.detail.map((text) => ({ cls: 'd', text })),
		...cell.discard.map((text) => ({
			cls: 'x',
			text: `✕ ${text}`,
		})),
		...(cell.name ? [{ cls: 'n', text: `[${cell.name}]` }] : []),
	].filter((part) => part.text);

const lines = (cell: Cell): string[] => parts(cell).map((p) => p.text);

const byRow = (grid: Grid): Cell[][] => {
	const rows: Cell[][] = Array.from({ length: grid.rows }, () => []);
	for (const cell of grid.cells) rows[cell.row]!.push(cell);
	for (const row of rows) row.sort((a, b) => a.col - b.col);
	return rows;
};

// blank cells suppress borders
export function toHtml({ title, notes, ingredients, grid }: Rendered): string {
	const rows = byRow(grid).map((cells) => {
		const tds = cells
			.map((cell) => {
				const attrs = [
					cell.rows > 1
						? ` rowspan="${cell.rows}"`
						: '',
					cell.cols > 1
						? ` colspan="${cell.cols}"`
						: '',
					cell.kind === 'step'
						? ' class="op" align="center" bgcolor="#f3f3f3"'
						: '',
					cell.kind === 'ref'
						? ' class="ref" bgcolor="#eaeaea"'
						: '',
					cell.kind === 'banner'
						? ' class="banner" align="center" bgcolor="#f8f8f8"'
						: '',
					cell.vertical
						? ' style="writing-mode: vertical-rl"'
						: '',
				].join('');
				const body = parts(cell)
					.map(
						(part) =>
							`<span class="${part.cls}">${escape(part.text)}</span>`,
					)
					.join('<br>');
				return `<td${attrs}>${body}</td>`;
			})
			.join('');
		return `<tr>${tds}</tr>`;
	});
	const caption = title ? `<caption>${escape(title)}</caption>` : '';
	const shopping = ingredients.length
		? `<tr class="shopping"><td colspan="${grid.cols}">${listed(ingredients).map(escape).join('<br>')}</td></tr>`
		: '';
	const preps = notes.length
		? `<tr class="notes"><td colspan="${grid.cols}">${numbered(notes).map(escape).join('<br>')}</td></tr>`
		: '';
	return `<table border="1" cellspacing="0" cellpadding="6">${caption}${shopping}${preps}${rows.join('')}</table>`;
}

export function toText({ title, notes, ingredients, grid }: Rendered): string {
	const out: string[] = [];
	if (title) out.push(title, '');
	out.push(...listed(ingredients));
	if (ingredients.length) out.push('');
	out.push(...numbered(notes));
	if (notes.length) out.push('');
	for (const cells of byRow(grid))
		out.push(
			cells.map((cell) => lines(cell).join(' / ')).join('\t'),
		);
	return out.join('\n');
}

// light palette: print output
const PRINT_CSS = `
@font-face {
	font-family: "iA Writer Quattro";
	src: url("/fonts/iAWriterQuattroV.woff2") format("woff2");
	font-weight: 400 700;
	font-style: normal;
}
:root {
	--foreground: oklch(0.25 0.05 140);
	--card: oklch(0.98 0.015 90);
	--primary: oklch(0.45 0.12 145);
	--muted: oklch(0.93 0.02 90);
	--muted-foreground: oklch(0.5 0.04 140);
	--border: oklch(0.88 0.03 95);
}
@page {
	margin: 14mm;
}
* {
	box-sizing: border-box;
}
body {
	margin: 0;
	background: #fff;
	color: var(--foreground);
	font-family: "iA Writer Quattro", ui-monospace, monospace;
	font-size: 10pt;
	line-height: 1.45;
	print-color-adjust: exact;
	-webkit-print-color-adjust: exact;
}
table {
	width: 100%;
	border: 2px solid var(--border);
	border-collapse: collapse;
}
caption {
	padding-bottom: 8pt;
	font-size: 15pt;
	font-weight: 700;
	text-align: left;
}
td {
	padding: 6pt 8pt;
	border: 1px solid var(--border);
	background: var(--card);
	vertical-align: middle;
}
tr.shopping td,
tr.notes td {
	background: #fff;
	font-size: 9pt;
}
tr.shopping td {
	border-bottom: 1px solid var(--border);
}
tr.notes td {
	border-bottom: 2px solid var(--border);
	color: var(--muted-foreground);
}
td.op {
	background: color-mix(in oklch, var(--muted) 40%, var(--card));
	text-align: center;
}
td.ref {
	background: color-mix(in oklch, var(--muted) 60%, var(--card));
}
td.banner {
	background: color-mix(in oklch, var(--muted) 25%, var(--card));
	text-align: center;
}
.l {
	font-weight: 500;
}
.d {
	color: var(--muted-foreground);
	font-size: 8.5pt;
}
.x {
	display: inline-block;
	padding: 0 2pt;
	border: 0.75pt dashed var(--muted-foreground);
	color: var(--muted-foreground);
	font-size: 8.5pt;
}
.n {
	color: var(--primary);
	font-size: 8.5pt;
}
tr {
	break-inside: avoid;
}
`;

// print dialog uses title
export function toPrintable(rendered: Rendered): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(
		rendered.title || 'Recipe',
	)}</title><style>${PRINT_CSS}</style></head><body>${toHtml(rendered)}</body></html>`;
}
