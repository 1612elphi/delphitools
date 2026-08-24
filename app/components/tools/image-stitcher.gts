import { concat, fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';

import type { TOC } from '@ember/component/template-only';

import DownloadLabel from 'delphitools-v2/components/download-label';
import Icon from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { encodeJxl } from 'delphitools-v2/lib/jxl';
import filePaste from 'delphitools-v2/modifiers/file-paste';

const DROP_HINT = 'Add several images at once or paste';

type Side = 'top' | 'left' | 'right' | 'bottom';
type Fit = 'match' | 'cheese' | 'matte';
type Mode = 'individual' | 'batch';
type Dir = 'row' | 'col';

const MATTE_COLOUR = '#ffffff';

const MODES: Mode[] = ['individual', 'batch'];
const FITS: Fit[] = ['match', 'cheese', 'matte'];

interface SideMeta {
	side: Side;
	add: string;
	place: string;
}

// generator needs literal icons
const SIDE_META: SideMeta[] = [
	{ side: 'top', add: 'Add top', place: 'Place top' },
	{ side: 'left', add: 'Add left', place: 'Place left' },
	{ side: 'right', add: 'Add right', place: 'Place right' },
	{ side: 'bottom', add: 'Add bottom', place: 'Place bottom' },
];

interface Src {
	id: string;
	name: string;
	el: HTMLImageElement;
	url: string;
	w: number;
	h: number;
}

type ExportFormat = 'png' | 'jpeg' | 'webp' | 'jxl';

interface FormatMeta {
	id: ExportFormat;
	label: string;
	mime: string;
	ext: string;
	lossy: boolean;
	alpha: boolean;
}

const EXPORT_FORMATS: FormatMeta[] = [
	{
		id: 'png',
		label: 'PNG',
		mime: 'image/png',
		ext: 'png',
		lossy: false,
		alpha: true,
	},
	{
		id: 'jpeg',
		label: 'JPEG',
		mime: 'image/jpeg',
		ext: 'jpg',
		lossy: true,
		alpha: false,
	},
	{
		id: 'webp',
		label: 'WebP',
		mime: 'image/webp',
		ext: 'webp',
		lossy: true,
		alpha: true,
	},
	{
		id: 'jxl',
		label: 'JXL',
		mime: 'image/jxl',
		ext: 'jxl',
		lossy: true,
		alpha: true,
	},
];

function formatMeta(id: ExportFormat): FormatMeta {
	return EXPORT_FORMATS.find((f) => f.id === id)!;
}

// libjxl needs origin
function jxlAvailable(): boolean {
	return typeof window !== 'undefined' && window.isSecureContext;
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	mimeType: string,
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(
							new Error(
								'Canvas toBlob failed',
							),
						),
			mimeType,
			quality === undefined ? undefined : quality / 100,
		);
	});
}

async function encodeCanvas(
	canvas: HTMLCanvasElement,
	format: ExportFormat,
	quality: number,
): Promise<Blob> {
	const meta = formatMeta(format);
	if (format === 'jxl') {
		return encodeJxl(canvas, { quality, lossless: quality >= 100 });
	}
	const blob = await canvasToBlob(
		canvas,
		meta.mime,
		meta.lossy ? quality : undefined,
	);
	if (blob.type && blob.type !== meta.mime) {
		throw new Error(
			`Encoder produced ${blob.type} instead of ${meta.mime}`,
		);
	}
	return blob;
}

interface LeafNode {
	kind: 'img';
	key: string;
	srcId: string;
	fit: Fit;
}

interface SplitNode {
	kind: 'split';
	key: string;
	dir: Dir;
	children: TreeNode[];
}

type TreeNode = LeafNode | SplitNode;

const leaf = (srcId: string, fit: Fit = 'cheese'): LeafNode => ({
	kind: 'img',
	key: crypto.randomUUID(),
	srcId,
	fit,
});

function leafSrcIds(node: TreeNode, into: string[] = []): string[] {
	if (node.kind === 'img') into.push(node.srcId);
	else node.children.forEach((c) => leafSrcIds(c, into));
	return into;
}

function mapLeaves(node: TreeNode, fn: (l: LeafNode) => LeafNode): TreeNode {
	if (node.kind === 'img') return fn(node);
	return {
		...node,
		children: node.children.map((c) => mapLeaves(c, fn)),
	};
}

function wrapNode(
	root: TreeNode,
	key: string | null,
	side: Side,
	added: LeafNode[],
): TreeNode {
	const wrap = (node: TreeNode): TreeNode => ({
		kind: 'split',
		key: crypto.randomUUID(),
		dir: side === 'left' || side === 'right' ? 'row' : 'col',
		children:
			side === 'left' || side === 'top'
				? [...added, node]
				: [node, ...added],
	});
	if (key === null) return wrap(root);
	const walk = (node: TreeNode): TreeNode => {
		if (node.key === key) return wrap(node);
		if (node.kind === 'split')
			return { ...node, children: node.children.map(walk) };
		return node;
	};
	return walk(root);
}

function insertIntoSplit(
	root: TreeNode,
	splitKey: string,
	at: number,
	added: LeafNode[],
): TreeNode {
	const walk = (node: TreeNode): TreeNode => {
		if (node.kind !== 'split') return node;
		if (node.key === splitKey) {
			return {
				...node,
				children: [
					...node.children.slice(0, at),
					...added,
					...node.children.slice(at),
				],
			};
		}
		return { ...node, children: node.children.map(walk) };
	};
	return walk(root);
}

function swapLeafContent(root: TreeNode, aKey: string, bKey: string): TreeNode {
	let a: LeafNode | undefined;
	let b: LeafNode | undefined;
	mapLeaves(root, (l) => {
		if (l.key === aKey) a = l;
		if (l.key === bKey) b = l;
		return l;
	});
	if (!a || !b) return root;
	// preserve type narrowing
	const from = a;
	const to = b;
	return mapLeaves(root, (l) => {
		if (l.key === aKey)
			return { ...l, srcId: to.srcId, fit: to.fit };
		if (l.key === bKey)
			return { ...l, srcId: from.srcId, fit: from.fit };
		return l;
	});
}

function removeLeafNode(root: TreeNode, key: string): TreeNode | null {
	const walk = (node: TreeNode): TreeNode | null => {
		if (node.kind === 'img') return node.key === key ? null : node;
		const children = node.children
			.map(walk)
			.filter((c): c is TreeNode => !!c);
		if (children.length === 0) return null;
		if (children.length === 1) return children[0]!;
		return { ...node, children };
	};
	return walk(root);
}

function moveLeafNode(
	root: TreeNode,
	movedKey: string,
	targetKey: string,
	side: Side,
): TreeNode {
	if (movedKey === targetKey) return root;
	let moved: LeafNode | undefined;
	mapLeaves(root, (l) => {
		if (l.key === movedKey) moved = l;
		return l;
	});
	const without = removeLeafNode(root, movedKey);
	if (!moved || !without) return root;
	return wrapNode(without, targetKey, side, [moved]);
}

interface Op {
	src: Src;
	leafKey: string;
	isBase: boolean;
	fit: Fit;
	sx: number;
	sy: number;
	sw: number;
	sh: number;
	dx: number;
	dy: number;
	dw: number;
	dh: number;
}

interface Seam {
	x: number;
	y: number;
	len: number;
	vertical: boolean;
	splitKey: string;
	at: number;
}

interface Layout {
	w: number;
	h: number;
	ops: Op[];
	seams: Seam[];
}

function coverCrop(src: Src, aspect: number) {
	if (src.w / src.h > aspect) {
		const sw = src.h * aspect;
		return { sx: (src.w - sw) / 2, sy: 0, sw, sh: src.h };
	}
	const sh = src.w / aspect;
	return { sx: 0, sy: (src.h - sh) / 2, sw: src.w, sh };
}

function nodeAspect(
	node: TreeNode,
	byId: Map<string, Src>,
	baseAspect: number,
): number {
	if (node.kind === 'img') {
		const src = byId.get(node.srcId);
		if (!src) return 1;
		return node.fit === 'cheese' ? src.w / src.h : baseAspect;
	}
	const as = node.children.map((c) => nodeAspect(c, byId, baseAspect));
	return node.dir === 'row'
		? as.reduce((s, a) => s + a, 0)
		: 1 / as.reduce((s, a) => s + 1 / a, 0);
}

function layoutTree(
	root: TreeNode,
	byId: Map<string, Src>,
	baseId: string,
): Layout | null {
	const base = byId.get(baseId);
	if (!base) return null;
	const baseAspect = base.w / base.h;
	const ops: Op[] = [];
	const seams: Seam[] = [];
	const walk = (
		node: TreeNode,
		x: number,
		y: number,
		w: number,
		h: number,
	) => {
		if (node.kind === 'img') {
			const src = byId.get(node.srcId);
			if (!src) return;
			const crop =
				node.fit === 'match'
					? coverCrop(src, w / h)
					: {
							sx: 0,
							sy: 0,
							sw: src.w,
							sh: src.h,
						};
			ops.push({
				src,
				leafKey: node.key,
				isBase: node.srcId === baseId,
				fit: node.fit,
				...crop,
				dx: x,
				dy: y,
				dw: w,
				dh: h,
			});
			return;
		}
		const as = node.children.map((c) =>
			nodeAspect(c, byId, baseAspect),
		);
		if (node.dir === 'row') {
			const total = as.reduce((s, a) => s + a, 0);
			let cx = x;
			node.children.forEach((c, i) => {
				const cw = w * (as[i]! / total);
				if (i > 0) {
					seams.push({
						x: cx,
						y,
						len: h,
						vertical: true,
						splitKey: node.key,
						at: i,
					});
				}
				walk(c, cx, y, cw, h);
				cx += cw;
			});
		} else {
			const inv = as.map((a) => 1 / a);
			const total = inv.reduce((s, a) => s + a, 0);
			let cy = y;
			node.children.forEach((c, i) => {
				const ch = h * (inv[i]! / total);
				if (i > 0) {
					seams.push({
						x,
						y: cy,
						len: w,
						vertical: false,
						splitKey: node.key,
						at: i,
					});
				}
				walk(c, x, cy, w, ch);
				cy += ch;
			});
		}
	};
	const rootAspect = nodeAspect(root, byId, baseAspect);
	walk(root, 0, 0, rootAspect * 1000, 1000);
	const baseOp = ops.find((o) => o.isBase);
	const k = baseOp ? base.w / baseOp.dw : 1;
	for (const op of ops) {
		op.dx *= k;
		op.dy *= k;
		op.dw *= k;
		op.dh *= k;
	}
	for (const s of seams) {
		s.x *= k;
		s.y *= k;
		s.len *= k;
	}
	return { w: rootAspect * 1000 * k, h: 1000 * k, ops, seams };
}

function layoutBatch(srcs: Src[]): Layout | null {
	const first = srcs[0];
	if (!first) return null;
	const cellW = first.w;
	const cellH = first.h;
	const aspect = cellW / cellH;
	const cols = Math.ceil(Math.sqrt(srcs.length));
	const ops = srcs.map((src, i) => ({
		src,
		leafKey: src.id,
		isBase: i === 0,
		fit: 'match' as const,
		...coverCrop(src, aspect),
		dx: (i % cols) * cellW,
		dy: Math.floor(i / cols) * cellH,
		dw: cellW,
		dh: cellH,
	}));
	return {
		w: cols * cellW,
		h: Math.ceil(srcs.length / cols) * cellH,
		ops,
		seams: [],
	};
}

function drawLayout(
	canvas: HTMLCanvasElement,
	layout: Layout,
	maxSide: number,
	bg?: string,
) {
	const scale = Math.min(1, maxSide / Math.max(layout.w, layout.h));
	canvas.width = Math.max(1, Math.round(layout.w * scale));
	canvas.height = Math.max(1, Math.round(layout.h * scale));
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (bg) {
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	for (const op of layout.ops) {
		if (op.fit === 'matte') {
			ctx.fillStyle = MATTE_COLOUR;
			ctx.fillRect(
				op.dx * scale,
				op.dy * scale,
				op.dw * scale,
				op.dh * scale,
			);
			const s = Math.min(op.dw / op.src.w, op.dh / op.src.h);
			const w = op.src.w * s;
			const h = op.src.h * s;
			ctx.drawImage(
				op.src.el,
				(op.dx + (op.dw - w) / 2) * scale,
				(op.dy + (op.dh - h) / 2) * scale,
				w * scale,
				h * scale,
			);
		} else {
			ctx.drawImage(
				op.src.el,
				op.sx,
				op.sy,
				op.sw,
				op.sh,
				op.dx * scale,
				op.dy * scale,
				op.dw * scale,
				op.dh * scale,
			);
		}
	}
}

type Target =
	| { kind: 'first' }
	| { kind: 'add'; nodeKey: string | null; side: Side }
	| { kind: 'insert'; splitKey: string; at: number }
	| { kind: 'batch' };

function loadImageFile(file: File): Promise<Src> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const el = new Image();
		el.onload = () =>
			resolve({
				id: crypto.randomUUID(),
				name: file.name.replace(/\.[^.]+$/, ''),
				el,
				url,
				w: el.naturalWidth,
				h: el.naturalHeight,
			});
		el.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('undecodable image'));
		};
		el.src = url;
	});
}

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

// prevent file navigation
function allowDrop(event: DragEvent) {
	event.preventDefault();
}

interface UploaderSignature {
	Args: {
		onPick: () => void;
		onDrop: (event: DragEvent) => void;
	};
}

const Uploader: TOC<UploaderSignature> = <template>
	<button
		type="button"
		class="dt-stitch-drop"
		{{on "click" @onPick}}
		{{on "drop" @onDrop}}
		{{on "dragover" allowDrop}}
	>
		<Icon @name="upload" />
		<span class="dt-stitch-drop-title">Drop images here</span>
		<span class="dt-stitch-drop-hint">{{DROP_HINT}}</span>
	</button>
</template>;

export default class ImageStitcherTool extends Component {
	@tracked mode: Mode = 'individual';
	@tracked srcs: Src[] = [];
	@tracked root: TreeNode | null = null;
	@tracked baseId: string | null = null;
	@tracked selectedKey: string | null = null;
	@tracked batchIds: string[] = [];
	@tracked format: ExportFormat = 'png';

	@tracked draggedLeafKey: string | null = null;
	@tracked dragOverLeafKey: string | null = null;
	@tracked dragOverPlace: string | null = null;
	@tracked draggedBatchId: string | null = null;
	@tracked dragOverBatchId: string | null = null;

	#fileInput: HTMLInputElement | null = null;
	#pendingTarget: Target = { kind: 'first' };

	willDestroy() {
		super.willDestroy();
		this.srcs.forEach((s) => URL.revokeObjectURL(s.url));
	}

	@cached
	get byId(): Map<string, Src> {
		return new Map(this.srcs.map((s) => [s.id, s]));
	}

	get base(): Src | null {
		return (this.baseId && this.byId.get(this.baseId)) || null;
	}

	get batchSrcs(): Src[] {
		return this.batchIds
			.map((id) => this.byId.get(id))
			.filter((s): s is Src => !!s);
	}

	@cached
	get trailLayout(): Layout | null {
		if (!this.root || !this.baseId) return null;
		return layoutTree(this.root, this.byId, this.baseId);
	}

	get isIndividual() {
		return this.mode === 'individual';
	}

	get hasResult() {
		return this.isIndividual
			? !!this.trailLayout
			: this.batchSrcs.length > 0;
	}

	get stageStyle() {
		const layout = this.trailLayout;
		if (!layout) return htmlSafe('');
		return htmlSafe(
			`width:min(100%, ${(440 * layout.w) / layout.h}px);aspect-ratio:${layout.w} / ${layout.h}`,
		);
	}

	get trailTiles() {
		const layout = this.trailLayout;
		if (!layout) return [];
		const { w, h } = layout;
		return layout.ops.map((op) => ({
			key: op.leafKey,
			srcId: op.src.id,
			url: op.src.url,
			name: op.src.name,
			isBase: op.isBase,
			fit: op.fit,
			isMatte: op.fit === 'matte',
			style: htmlSafe(
				`left:${pct(op.dx, w)};top:${pct(op.dy, h)};width:${pct(op.dw, w)};height:${pct(op.dh, h)}`,
			),
			matteStyle: htmlSafe(
				op.fit === 'matte'
					? `background-color:${MATTE_COLOUR}`
					: '',
			),
		}));
	}

	get trailSeams() {
		const layout = this.trailLayout;
		if (!layout) return [];
		const { w, h } = layout;
		return layout.seams.map((s) => ({
			id: `${s.splitKey}-${s.at}`,
			splitKey: s.splitKey,
			at: s.at,
			vertical: s.vertical,
			style: htmlSafe(
				s.vertical
					? `left:${pct(s.x, w)};top:${pct(s.y, h)};height:${pct(s.len, h)};width:0`
					: `left:${pct(s.x, w)};top:${pct(s.y, h)};width:${pct(s.len, w)};height:0`,
			),
		}));
	}

	get selectionAdders() {
		const layout = this.trailLayout;
		if (!layout || !this.selectedKey) return [];
		const sel = layout.ops.find(
			(o) => o.leafKey === this.selectedKey,
		);
		if (!sel) return [];
		const { w, h } = layout;
		return SIDE_META.map(({ side }) => {
			const horizontal = side === 'left' || side === 'right';
			const style = horizontal
				? [
						`top:${pct(sel.dy, h)}`,
						`height:${pct(sel.dh, h)}`,
						'width:22px',
						side === 'left'
							? `left:${pct(sel.dx, w)}`
							: `left:calc(${pct(sel.dx + sel.dw, w)} - 22px)`,
					]
				: [
						`left:${pct(sel.dx, w)}`,
						`width:${pct(sel.dw, w)}`,
						'height:22px',
						side === 'top'
							? `top:${pct(sel.dy, h)}`
							: `top:calc(${pct(sel.dy + sel.dh, h)} - 22px)`,
					];
			return {
				side,
				nodeKey: sel.leafKey,
				label: `Add ${side} here`,
				style: htmlSafe(style.join(';')),
			};
		});
	}

	get batchThumbs() {
		return this.batchSrcs.map((src, i) => ({
			id: src.id,
			src,
			number: i + 1,
		}));
	}

	get batchPreview() {
		const srcs = this.batchSrcs;
		const first = srcs[0];
		if (!first) return null;
		const cols = Math.ceil(Math.sqrt(srcs.length));
		return {
			srcs,
			gridStyle: htmlSafe(
				`grid-template-columns:repeat(${cols}, 1fr)`,
			),
			cellStyle: htmlSafe(
				`aspect-ratio:${first.w} / ${first.h}`,
			),
		};
	}

	get formatOptions() {
		const jxlOk = jxlAvailable();
		return EXPORT_FORMATS.map((f) => ({
			...f,
			disabled: f.id === 'jxl' && !jxlOk,
		}));
	}

	get formatLabel() {
		return formatMeta(this.format).label;
	}

	async #addFiles(files: Iterable<File>): Promise<Src[]> {
		// snapshot transient file lists
		const list = Array.from(files);
		const added: Src[] = [];
		for (const file of list) {
			if (!file.type.startsWith('image/')) continue;
			try {
				added.push(await loadImageFile(file));
			} catch {
			}
		}
		if (added.length) this.srcs = [...this.srcs, ...added];
		return added;
	}

	#place(added: Src[], target: Target) {
		const firstAdded = added[0];
		if (!firstAdded) return;
		const leaves = added.map((s) => leaf(s.id));
		if (target.kind === 'batch') {
			this.batchIds = [
				...this.batchIds,
				...added.map((s) => s.id),
			];
		} else if (target.kind === 'first') {
			this.baseId = firstAdded.id;
			this.root =
				leaves.length === 1
					? leaves[0]!
					: {
							kind: 'split',
							key: crypto.randomUUID(),
							dir: 'row',
							children: leaves,
						};
		} else if (target.kind === 'add') {
			if (this.root) {
				this.root = wrapNode(
					this.root,
					target.nodeKey,
					target.side,
					leaves,
				);
			}
		} else if (this.root) {
			this.root = insertIntoSplit(
				this.root,
				target.splitKey,
				target.at,
				leaves,
			);
		}
	}

	async #dropFiles(files: Iterable<File>, target: Target) {
		this.#place(await this.#addFiles(files), target);
	}

	#openPicker(target: Target) {
		this.#pendingTarget = target;
		this.#fileInput?.click();
	}

	registerFileInput = modifier((element: HTMLInputElement) => {
		this.#fileInput = element;
		return () => {
			this.#fileInput = null;
		};
	});

	pickFiles = (event: Event) => {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			void this.#dropFiles(input.files, this.#pendingTarget);
		}
		// reset file input
		input.value = '';
	};

	pasteFile = (file: File) => {
		if (this.mode === 'batch') {
			void this.#dropFiles([file], { kind: 'batch' });
			return;
		}
		void this.#dropFiles(
			[file],
			this.root
				? {
						kind: 'add',
						nodeKey: this.selectedKey,
						side: 'right',
					}
				: { kind: 'first' },
		);
	};

	pickFirst = () => this.#openPicker({ kind: 'first' });
	pickBatch = () => this.#openPicker({ kind: 'batch' });

	pickSide = (side: Side, event: Event) => {
		event.stopPropagation();
		this.#openPicker({ kind: 'add', nodeKey: null, side });
	};

	pickAdd = (nodeKey: string, side: Side, event: Event) => {
		event.stopPropagation();
		this.#openPicker({ kind: 'add', nodeKey, side });
	};

	pickSeam = (splitKey: string, at: number, event: Event) => {
		event.stopPropagation();
		this.#openPicker({ kind: 'insert', splitKey, at });
	};

	dropFirst = (event: DragEvent) => {
		event.preventDefault();
		void this.#dropFiles(event.dataTransfer?.files ?? [], {
			kind: 'first',
		});
	};

	dropBatch = (event: DragEvent) => {
		event.preventDefault();
		void this.#dropFiles(event.dataTransfer?.files ?? [], {
			kind: 'batch',
		});
	};

	dropSide = (side: Side, event: DragEvent) => {
		event.preventDefault();
		void this.#dropFiles(event.dataTransfer?.files ?? [], {
			kind: 'add',
			nodeKey: null,
			side,
		});
	};

	dropAdd = (nodeKey: string, side: Side, event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		void this.#dropFiles(event.dataTransfer?.files ?? [], {
			kind: 'add',
			nodeKey,
			side,
		});
	};

	#revoke(ids: Set<string>) {
		for (const id of ids) {
			const s = this.byId.get(id);
			if (s) URL.revokeObjectURL(s.url);
		}
		this.srcs = this.srcs.filter((s) => !ids.has(s.id));
	}

	setMode = (mode: Mode) => (this.mode = mode);
	setFormat = (format: ExportFormat) => (this.format = format);

	selectTile = (key: string, event: Event) => {
		event.stopPropagation();
		this.selectedKey = this.selectedKey === key ? null : key;
	};

	clearSelection = () => {
		this.selectedKey = null;
	};

	setFit = (key: string, fit: Fit, event: Event) => {
		event.stopPropagation();
		if (!this.root) return;
		this.root = mapLeaves(this.root, (l) =>
			l.key === key ? { ...l, fit } : l,
		);
	};

	removeTile = (key: string, srcId: string, event: Event) => {
		event.stopPropagation();
		if (this.root) this.root = removeLeafNode(this.root, key);
		if (this.selectedKey === key) this.selectedKey = null;
		this.#revoke(new Set([srcId]));
	};

	removeBatchSrc = (id: string, event: Event) => {
		event.stopPropagation();
		this.batchIds = this.batchIds.filter((x) => x !== id);
		this.#revoke(new Set([id]));
	};

	clearTrail = () => {
		if (this.root) this.#revoke(new Set(leafSrcIds(this.root)));
		this.root = null;
		this.baseId = null;
		this.selectedKey = null;
	};

	escapeKey = modifier((element: HTMLElement) => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') this.selectedKey = null;
		};
		element.ownerDocument.addEventListener('keydown', onKeyDown);
		return () =>
			element.ownerDocument.removeEventListener(
				'keydown',
				onKeyDown,
			);
	});

	#endTrailDrag() {
		this.draggedLeafKey = null;
		this.dragOverLeafKey = null;
		this.dragOverPlace = null;
	}

	dragStartTile = (key: string, event: DragEvent) => {
		this.draggedLeafKey = key;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', key);
		}
	};

	dragEndTile = () => this.#endTrailDrag();

	// avoid redundant tracked writes
	dragOverTile = (key: string, event: DragEvent) => {
		event.preventDefault();
		if (this.dragOverPlace !== null) this.dragOverPlace = null;
		const next =
			this.draggedLeafKey && this.draggedLeafKey !== key
				? key
				: null;
		if (this.dragOverLeafKey !== next) this.dragOverLeafKey = next;
	};

	// clear bubbled dragleave state
	dragLeaveTile = () => {
		if (this.dragOverLeafKey !== null) this.dragOverLeafKey = null;
		if (this.dragOverPlace !== null) this.dragOverPlace = null;
	};

	dropOnTile = (key: string, event: DragEvent) => {
		event.preventDefault();
		const from = this.draggedLeafKey;
		this.#endTrailDrag();
		if (!from || from === key || !this.root) return;
		this.root = swapLeafContent(this.root, from, key);
	};

	// prioritize edge drops
	dragOverPlaceZone = (key: string, side: Side, event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (!this.draggedLeafKey) return;
		if (this.dragOverLeafKey !== null) this.dragOverLeafKey = null;
		const next = `${key}:${side}`;
		if (this.dragOverPlace !== next) this.dragOverPlace = next;
	};

	dropOnPlace = (key: string, side: Side, event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const from = this.draggedLeafKey;
		this.#endTrailDrag();
		if (!from || !this.root) return;
		this.root = moveLeafNode(this.root, from, key, side);
	};

	dragStartThumb = (id: string, event: DragEvent) => {
		this.draggedBatchId = id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', id);
		}
	};

	dragOverThumb = (id: string, event: DragEvent) => {
		event.preventDefault();
		if (this.draggedBatchId === id) return;
		if (this.dragOverBatchId !== id) this.dragOverBatchId = id;
	};

	dragLeaveThumb = () => {
		if (this.dragOverBatchId !== null) this.dragOverBatchId = null;
	};

	dragEndThumb = () => {
		this.draggedBatchId = null;
		this.dragOverBatchId = null;
	};

	dropOnThumb = (id: string, event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const from = this.draggedBatchId;
		this.draggedBatchId = null;
		this.dragOverBatchId = null;

		const files = event.dataTransfer?.files;
		if (files && files.length) {
			void this.#dropFiles(files, { kind: 'batch' });
			return;
		}
		if (!from || from === id) return;

		const next = [...this.batchIds];
		const fromIndex = next.indexOf(from);
		const toIndex = next.indexOf(id);
		if (fromIndex < 0 || toIndex < 0) return;
		const [moved] = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, moved!);
		this.batchIds = next;
	};

	download = async () => {
		const layout = this.isIndividual
			? this.trailLayout
			: layoutBatch(this.batchSrcs);
		if (!layout) return;
		const meta = formatMeta(this.format);
		const canvas = document.createElement('canvas');
		// canvas side cap
		drawLayout(
			canvas,
			layout,
			16384,
			meta.alpha ? undefined : MATTE_COLOUR,
		);
		try {
			const blob = await encodeCanvas(
				canvas,
				this.format,
				90,
			);
			const name = this.isIndividual
				? this.base?.name
				: this.batchSrcs[0]?.name;
			downloadBlob(
				blob,
				`${name || 'stitched'}-stitched.${meta.ext}`,
			);
		} catch (err) {
			console.error('stitch export failed', err);
		}
	};

	<template>
		<div
			class="dt-stitch"
			{{filePaste this.pasteFile accept="image/*"}}
			{{this.escapeKey}}
		>
			<input
				type="file"
				accept="image/*"
				multiple
				aria-label="Add images"
				hidden
				{{this.registerFileInput}}
				{{on "change" this.pickFiles}}
			/>

			<div class="dt-stitch-frame">
				<div class="dt-stitch-modes">
					{{#each MODES key="@index" as |m|}}
						<button
							type="button"
							class="dt-stitch-mode
								{{if
									(eq
										this.mode
										m
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setMode
									m
								)
							}}
						>{{m}}</button>
					{{/each}}
				</div>

				{{#if this.isIndividual}}
					{{#if this.trailLayout}}
						<div class="dt-stitch-bar">
							<button
								type="button"
								class="dt-stitch-clear"
								{{on
									"click"
									this.clearTrail
								}}
							>
								<Icon
									@name="trash-2"
								/>
								Clear
							</button>
						</div>

						{{! template-lint-disable no-invalid-interactive }}
						<div
							class="dt-stitch-stage"
							{{on
								"click"
								this.clearSelection
							}}
						>
							{{#each
								SIDE_META
								key="side"
								as |meta|
							}}
								<button
									type="button"
									class="dt-stitch-side is-{{meta.side}}
										{{if
											this.selectedKey
											'is-hidden'
										}}"
									aria-label={{meta.add}}
									{{on
										"click"
										(fn
											this.pickSide
											meta.side
										)
									}}
									{{on
										"drop"
										(fn
											this.dropSide
											meta.side
										)
									}}
									{{on
										"dragover"
										allowDrop
									}}
								>
									<Icon
										@name="plus"
									/>
								</button>
							{{/each}}

							<div
								class="dt-stitch-trail"
							>
								<div
									class="dt-stitch-canvas
										{{if
											this.draggedLeafKey
											'is-dragging'
										}}"
									style={{this.stageStyle}}
								>
									{{#each
										this.trailTiles
										key="key"
										as |tile|
									}}
										{{! template-lint-disable no-invalid-interactive }}
										<div
											class="dt-stitch-tile
												{{if
													(eq
														this.dragOverLeafKey
														tile.key
													)
													'is-over'
												}}"
											style={{tile.style}}
											{{on
												"click"
												(fn
													this.selectTile
													tile.key
												)
											}}
											{{on
												"dragover"
												(fn
													this.dragOverTile
													tile.key
												)
											}}
											{{on
												"dragleave"
												this.dragLeaveTile
											}}
											{{on
												"drop"
												(fn
													this.dropOnTile
													tile.key
												)
											}}
										>
											<div
												class="dt-stitch-grab
													{{if
														(eq
															this.draggedLeafKey
															tile.key
														)
														'is-dragging'
													}}"
												style={{tile.matteStyle}}
												draggable="true"
												{{on
													"dragstart"
													(fn
														this.dragStartTile
														tile.key
													)
												}}
												{{on
													"dragend"
													this.dragEndTile
												}}
											>
												<img
													class="dt-stitch-img
														{{if
															tile.isMatte
															'is-contain'
														}}"
													src={{tile.url}}
													alt={{tile.name}}
												/>
											</div>

											<span
												class="dt-stitch-ring
													{{if
														(eq
															this.selectedKey
															tile.key
														)
														'is-selected'
													}}"
												aria-hidden="true"
											></span>

											{{#if
												this.draggedLeafKey
											}}
												{{#unless
													(eq
														this.draggedLeafKey
														tile.key
													)
												}}
													{{#each
														SIDE_META
														key="side"
														as |meta|
													}}
														{{! template-lint-disable no-invalid-interactive }}
														<div
															class="dt-stitch-place is-{{meta.side}}
																{{if
																	(eq
																		this.dragOverPlace
																		(concat
																			tile.key
																			':'
																			meta.side
																		)
																	)
																	'is-over'
																}}"
															aria-label={{meta.place}}
															{{on
																"dragover"
																(fn
																	this.dragOverPlaceZone
																	tile.key
																	meta.side
																)
															}}
															{{on
																"drop"
																(fn
																	this.dropOnPlace
																	tile.key
																	meta.side
																)
															}}
														>
															<span
																class="dt-stitch-place-badge"
															><Icon
																	@name={{if
																		(eq
																			meta.side
																			"top"
																		)
																		"arrow-up"
																		(if
																			(eq
																				meta.side
																				"bottom"
																			)
																			"arrow-down"
																			(if
																				(eq
																					meta.side
																					"left"
																				)
																				"arrow-left"
																				"arrow-right"
																			)
																		)
																	}}
																/></span>
														</div>
													{{/each}}
												{{/unless}}
											{{else}}
												{{#unless
													tile.isBase
												}}
													<div
														class="dt-stitch-pill"
													>
														{{#each
															FITS
															key="@index"
															as |f|
														}}
															<button
																type="button"
																class="dt-stitch-fit
																	{{if
																		(eq
																			tile.fit
																			f
																		)
																		'is-active'
																	}}"
																{{on
																	"click"
																	(fn
																		this.setFit
																		tile.key
																		f
																	)
																}}
															>{{f}}</button>
														{{/each}}
														<button
															type="button"
															class="dt-stitch-tile-remove"
															aria-label="Remove tile"
															{{on
																"click"
																(fn
																	this.removeTile
																	tile.key
																	tile.srcId
																)
															}}
														>
															<Icon
																@name="x"
															/>
														</button>
													</div>
												{{/unless}}
											{{/if}}
										</div>
									{{/each}}

									{{#unless
										this.draggedLeafKey
									}}
										{{#each
											this.trailSeams
											key="id"
											as |seam|
										}}
											<div
												class="dt-stitch-seam
													{{if
														seam.vertical
														'is-vertical'
													}}"
												style={{seam.style}}
											>
												<span
													class="dt-stitch-seam-hit"
												></span>
												<button
													type="button"
													class="dt-stitch-seam-add"
													aria-label="Insert here"
													{{on
														"click"
														(fn
															this.pickSeam
															seam.splitKey
															seam.at
														)
													}}
												>
													<Icon
														@name="plus"
													/>
												</button>
											</div>
										{{/each}}

										{{#each
											this.selectionAdders
											key="side"
											as |adder|
										}}
											<button
												type="button"
												class="dt-stitch-adder"
												style={{adder.style}}
												aria-label={{adder.label}}
												{{on
													"click"
													(fn
														this.pickAdd
														adder.nodeKey
														adder.side
													)
												}}
												{{on
													"drop"
													(fn
														this.dropAdd
														adder.nodeKey
														adder.side
													)
												}}
												{{on
													"dragover"
													allowDrop
												}}
											>
												<Icon
													@name="plus"
												/>
											</button>
										{{/each}}
									{{/unless}}
								</div>
							</div>
						</div>
					{{else}}
						<Uploader
							@onPick={{this.pickFirst}}
							@onDrop={{this.dropFirst}}
						/>
					{{/if}}
				{{else if this.batchThumbs.length}}
						{{! template-lint-disable no-invalid-interactive }}
					<div
						class="dt-stitch-pool"
						{{on "drop" this.dropBatch}}
						{{on "dragover" allowDrop}}
					>
						{{#each
							this.batchThumbs
							key="id"
							as |thumb|
						}}
							<div
								class="dt-stitch-thumb
									{{if
										(eq
											this.draggedBatchId
											thumb.id
										)
										'is-dragging'
									}}
									{{if
										(eq
											this.dragOverBatchId
											thumb.id
										)
										'is-over'
									}}"
								draggable="true"
								{{on
									"dragstart"
									(fn
										this.dragStartThumb
										thumb.id
									)
								}}
								{{on
									"dragover"
									(fn
										this.dragOverThumb
										thumb.id
									)
								}}
								{{on
									"dragleave"
									this.dragLeaveThumb
								}}
								{{on
									"drop"
									(fn
										this.dropOnThumb
										thumb.id
									)
								}}
								{{on
									"dragend"
									this.dragEndThumb
								}}
							>
								<img
									class="dt-stitch-thumb-img"
									src={{thumb.src.url}}
									alt={{thumb.src.name}}
								/>
								<span
									class="dt-stitch-thumb-index"
								>{{thumb.number}}</span>
								<button
									type="button"
									class="dt-stitch-thumb-remove"
									aria-label="Remove image"
									{{on
										"click"
										(fn
											this.removeBatchSrc
											thumb.id
										)
									}}
								>
									<Icon
										@name="x"
									/>
								</button>
							</div>
						{{/each}}
						<button
							type="button"
							class="dt-stitch-pool-add"
							aria-label="Add images"
							{{on
								"click"
								this.pickBatch
							}}
						>
							<Icon @name="plus" />
						</button>
					</div>

					{{#if this.batchPreview}}
						<div class="dt-stitch-preview">
							<div
								class="dt-stitch-preview-grid"
								style={{this.batchPreview.gridStyle}}
							>
								{{#each
									this.batchPreview.srcs
									key="id"
									as |s|
								}}
									<div
										class="dt-stitch-preview-cell"
										style={{this.batchPreview.cellStyle}}
									>
										<img
											src={{s.url}}
											alt={{s.name}}
										/>
									</div>
								{{/each}}
							</div>
						</div>
					{{/if}}
				{{else}}
					<Uploader
						@onPick={{this.pickBatch}}
						@onDrop={{this.dropBatch}}
					/>
				{{/if}}

				{{#if this.hasResult}}
					<div class="dt-stitch-export">
						{{#each
							this.formatOptions
							key="id"
							as |f|
						}}
							<button
								type="button"
								class="dt-stitch-format
									{{if
										(eq
											this.format
											f.id
										)
										'is-active'
									}}"
								disabled={{f.disabled}}
								{{on
									"click"
									(fn
										this.setFormat
										f.id
									)
								}}
							>{{f.label}}</button>
						{{/each}}
						<button
							type="button"
							class="dt-stitch-download"
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel
								@label="Download {{this.formatLabel}}"
							/>
						</button>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
