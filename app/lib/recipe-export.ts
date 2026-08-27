import type { Cell, Grid } from './recipe-table';

export interface ExportMeta {
	title: string;
	preps: string[];
}

const escape = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

const lines = (cell: Cell): string[] =>
	[
		cell.kind === 'ref' ? `↩ ${cell.text}` : cell.text,
		...cell.notes,
		...cell.discard.map((d) => `✕ ${d}`),
		...(cell.tag ? [`[${cell.tag}]`] : []),
	].filter(Boolean);

const byRow = (grid: Grid): Cell[][] => {
	const rows: Cell[][] = Array.from({ length: grid.rows }, () => []);
	for (const cell of grid.cells) rows[cell.row]!.push(cell);
	for (const row of rows) row.sort((a, b) => a.col - b.col);
	return rows;
};

// every square gets a cell, which is what keeps browsers from drawing
// stray borders in the original hand-written tables
export function toHtml(meta: ExportMeta, grid: Grid): string {
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
					cell.kind === 'op'
						? ' class="op" align="center" bgcolor="#f3f3f3"'
						: '',
					cell.kind === 'ref'
						? ' class="ref" bgcolor="#eaeaea"'
						: '',
					cell.vertical
						? ' style="writing-mode: vertical-rl"'
						: '',
				].join('');
				return `<td${attrs}>${lines(cell).map(escape).join('<br>')}</td>`;
			})
			.join('');
		return `<tr>${tds}</tr>`;
	});
	const head = meta.title
		? `<caption>${escape(meta.title)}</caption>`
		: '';
	const preps = meta.preps.length
		? `<tr><td colspan="${grid.cols}">${meta.preps.map(escape).join('<br>')}</td></tr>`
		: '';
	return `<table border="1" cellspacing="0" cellpadding="6">${head}${preps}${rows.join('')}</table>`;
}

export function toText(meta: ExportMeta, grid: Grid): string {
	const out: string[] = [];
	if (meta.title) out.push(meta.title, '');
	out.push(...meta.preps);
	if (meta.preps.length) out.push('');
	for (const cells of byRow(grid))
		out.push(
			cells.map((cell) => lines(cell).join(' / ')).join('\t'),
		);
	return out.join('\n');
}

const FONT = 10;
const SMALL = 8;
const LINE = 14;
const PAD = 8;
const MARGIN = 24;

// WinAnsi has no arrows, crosses or eighths
const ASCII: [RegExp, string][] = [
	[/↩/g, '<'],
	[/✕/g, 'x'],
	[/⅓/g, '1/3'],
	[/⅔/g, '2/3'],
	[/⅛/g, '1/8'],
	[/⅜/g, '3/8'],
	[/⅝/g, '5/8'],
	[/⅞/g, '7/8'],
	[/⅕/g, '1/5'],
	[/⅖/g, '2/5'],
	[/⅗/g, '3/5'],
	[/⅘/g, '4/5'],
	[/⅙/g, '1/6'],
	[/⅚/g, '5/6'],
	[
		/[^\u0020-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/g,
		'?',
	],
];
const ascii = (text: string) =>
	ASCII.reduce((t, [re, to]) => t.replace(re, to), text);

export async function toPdf(meta: ExportMeta, grid: Grid): Promise<Uint8Array> {
	const { PDFDocument, StandardFonts, rgb, degrees } =
		await import('pdf-lib');
	const pdf = await PDFDocument.create();
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const width = (text: string, size: number, font = regular) =>
		font.widthOfTextAtSize(text, size);

	const cellLines = (cell: Cell) => lines(cell).map(ascii);
	const widths = new Array<number>(grid.cols).fill(LINE + PAD * 2);
	const heights = new Array<number>(grid.rows).fill(LINE + PAD * 2);
	for (const cell of grid.cells) {
		const text = cellLines(cell);
		if (cell.vertical) {
			widths[cell.col] = Math.max(
				widths[cell.col]!,
				text.length * LINE + PAD * 2,
			);
			continue;
		}
		const longest = Math.max(
			0,
			...text.map((t, i) =>
				width(t, i ? SMALL : FONT, i ? regular : bold),
			),
		);
		if (cell.cols === 1)
			widths[cell.col] = Math.max(
				widths[cell.col]!,
				longest + PAD * 2,
			);
		if (cell.rows === 1)
			heights[cell.row] = Math.max(
				heights[cell.row]!,
				text.length * LINE + PAD * 2,
			);
	}
	for (const cell of grid.cells) {
		if (!cell.vertical) continue;
		const need =
			Math.max(
				0,
				...cellLines(cell).map((t) =>
					width(t, FONT, bold),
				),
			) +
			PAD * 2;
		const have = heights
			.slice(cell.row, cell.row + cell.rows)
			.reduce((sum, h) => sum + h, 0);
		if (have < need)
			heights[cell.row + cell.rows - 1]! += need - have;
	}
	const x = (col: number) =>
		widths.slice(0, col).reduce((sum, w) => sum + w, 0);
	const y = (row: number) =>
		heights.slice(0, row).reduce((sum, h) => sum + h, 0);
	const titleHeight = meta.title ? LINE + PAD : 0;
	const prepHeight = meta.preps.length
		? meta.preps.length * LINE + PAD
		: 0;
	const top = titleHeight + prepHeight;
	const pageW = x(grid.cols) + MARGIN * 2;
	const pageH = top + y(grid.rows) + MARGIN * 2;
	const page = pdf.addPage([pageW, pageH]);
	// pdf origin is bottom-left; everything below is laid out top-down
	const flip = (yTop: number) => pageH - MARGIN - yTop;
	const ink = rgb(0.13, 0.13, 0.13);
	const muted = rgb(0.4, 0.4, 0.4);

	if (meta.title)
		page.drawText(ascii(meta.title), {
			x: MARGIN,
			y: flip(LINE - 3),
			size: FONT + 2,
			font: bold,
			color: ink,
		});
	meta.preps.forEach((prep, i) =>
		page.drawText(ascii(prep), {
			x: MARGIN,
			y: flip(titleHeight + LINE * (i + 1) - 3),
			size: FONT,
			font: regular,
			color: muted,
		}),
	);

	for (const cell of grid.cells) {
		const cx = MARGIN + x(cell.col);
		const cw = x(cell.col + cell.cols) - x(cell.col);
		const ch = y(cell.row + cell.rows) - y(cell.row);
		const cyTop = top + y(cell.row);
		const shade =
			cell.kind === 'op'
				? 0.95
				: cell.kind === 'ref'
					? 0.92
					: 1;
		page.drawRectangle({
			x: cx,
			y: flip(cyTop + ch),
			width: cw,
			height: ch,
			color: rgb(shade, shade, shade),
			borderColor: ink,
			borderWidth: 0.75,
		});
		const text = cellLines(cell);
		if (!text.length) continue;
		const block = text.length * LINE;
		if (cell.vertical) {
			// rotated 90°: lines advance along x, text runs bottom-to-top
			const startX = cx + cw / 2 - block / 2 + LINE * 0.75;
			text.forEach((t, i) => {
				const size = i ? SMALL : FONT;
				const font = i ? regular : bold;
				page.drawText(t, {
					x: startX + i * LINE,
					y:
						flip(cyTop + ch / 2) -
						width(t, size, font) / 2,
					size,
					font,
					color: i ? muted : ink,
					rotate: degrees(90),
				});
			});
			continue;
		}
		text.forEach((t, i) => {
			const size = i ? SMALL : FONT;
			const font = i ? regular : bold;
			const tw = width(t, size, font);
			const tx =
				cell.kind === 'op'
					? cx + cw / 2 - tw / 2
					: cx + PAD;
			page.drawText(t, {
				x: tx,
				y: flip(
					cyTop +
						(ch - block) / 2 +
						LINE * (i + 1) -
						3,
				),
				size,
				font,
				color: i ? muted : ink,
			});
		});
	}
	return pdf.save();
}
