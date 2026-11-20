import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { isDestroying, registerDestructor } from '@ember/destroyable';
import { concat } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
	type CanonPageMenuItem,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { stem } from 'delphicanon/lib/files';
import { reducedMotion, springEasing } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { clipboardImages } from 'delphitools-v2/lib/clipboard-images';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Picture from 'delphitools-v2/components/tools/image-stitcher/picture';
import {
	FITS,
	batchDrop,
	batchGrid,
	exportSize,
	findLeaf,
	insertIntoSplit,
	layoutBatch,
	layoutTree,
	leaf,
	leafKeyOf,
	leafSrcIds,
	moveLeafNode,
	removeLeafNode,
	settingFit,
	splitterGrid,
	swapLeafContent,
	wrapNode,
	type Drop as TileDrop,
	type Fit,
	type Layout,
	type Side,
	type Src,
	type Target,
	type TreeNode,
} from 'delphitools-v2/components/tools/image-stitcher/stitch';
import {
	encode,
	formats,
	jxlAvailable,
	render,
	type ExportFormat,
} from 'delphitools-v2/components/tools/image-stitcher/export';
import './image-stitcher/image-stitcher.css';

const spring = htmlSafe(`--stitch-spring: ${springEasing(0.82)}`);
const springMs = 450;
const stripStyle = htmlSafe(`block-size: ${pageStripHeight}px`);
const BLANK_PAGES: CanonPage[] = [{ size: { width: 4, height: 3 } }];
const aspects = { min: 0.75, max: 1.5, empty: 4 / 3 };
const modes = ['Individual', 'Batch'];
const fitLabels = ['Match', 'Cheese', 'Matte'];
const formatLabels = formats.map((f) => f.label);
const dash = '—';

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const SortUp = <template><IconSvg @name="arrow-down" /></template>;
const SortDown = <template><IconSvg @name="arrow-up" /></template>;
const Pin = <template><IconSvg @name="pin" /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

const pixels = (width: number, height: number) =>
	`${Math.round(width)} × ${Math.round(height)} px`;

let nextId = 1;

function loadImage(file: File): Promise<Src> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const el = new Image();
		const fail = () => {
			URL.revokeObjectURL(url);
			reject(new Error('undecodable image'));
		};
		el.onload = () =>
			el.naturalWidth && el.naturalHeight
				? resolve({
						id: `s${nextId++}`,
						name:
							stem(file.name) ||
							'pasted',
						el,
						url,
						w: el.naturalWidth,
						h: el.naturalHeight,
					})
				: fail();
		el.onerror = fail;
		el.src = url;
	});
}

function drawnSamples(): Promise<File[]> {
	const specs: [string, number, number, string][] = [
		['coast', 1600, 1200, '#2b5fc0'],
		['field', 900, 1200, '#2b9c5f'],
		['dusk', 1200, 800, '#c0392b'],
		['sand', 1000, 1000, '#d9a43a'],
	];
	return Promise.all(
		specs.map(
			([name, width, height, colour]) =>
				new Promise<File>((resolve) => {
					const canvas =
						document.createElement(
							'canvas',
						);
					canvas.width = width;
					canvas.height = height;
					const ctx = canvas.getContext('2d')!;
					ctx.fillStyle = colour;
					ctx.fillRect(0, 0, width, height);
					ctx.fillStyle =
						'rgb(255 255 255 / 0.6)';
					ctx.beginPath();
					ctx.arc(
						width * 0.35,
						height * 0.4,
						Math.min(width, height) * 0.22,
						0,
						7,
					);
					ctx.fill();
					canvas.toBlob((blob) =>
						resolve(
							new File(
								[blob!],
								`${name}.png`,
								{
									type: 'image/png',
								},
							),
						),
					);
				}),
		),
	);
}

const sides: Record<string, Side> = {
	top: 'top',
	left: 'left',
	right: 'right',
	bottom: 'bottom',
};

export default class ImageStitcher extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked batch = false;
	@tracked srcs: Src[] = [];
	@tracked root: TreeNode | null = null;
	@tracked baseId: string | null = null;
	@tracked selected: string | null = null;
	@tracked batchIds: string[] = [];
	@tracked batchColumns: number | null = null;
	@tracked format: ExportFormat = 'png';
	@tracked loads = 0;
	@tracked exporting = false;
	@tracked springs = false;

	drop = new Drop(
		'image/*',
		(files) => void this.add(files, this.defaultTarget),
		true,
	);
	#input?: HTMLInputElement;
	#pending: Target = { kind: 'first' };
	#timer?: number;
	#adding: Promise<unknown> = Promise.resolve();

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		if (query.get('stitchMode') === 'batch') this.batch = true;
		if (query.has('stitchSample'))
			void drawnSamples().then((files) =>
				this.#script(
					files,
					query.get('stitchScript') ??
						(this.batch
							? 'batch:all'
							: 'seed:all'),
				),
			);
		registerDestructor(this, () => {
			window.clearTimeout(this.#timer);
			this.srcs.forEach((s) => URL.revokeObjectURL(s.url));
		});
	}

	@cached
	get byId(): Map<string, Src> {
		return new Map(this.srcs.map((s) => [s.id, s]));
	}

	get batchSrcs(): Src[] {
		return this.batchIds
			.map((id) => this.byId.get(id))
			.filter((s): s is Src => !!s);
	}

	@cached
	get layout(): Layout | null {
		if (this.batch)
			return layoutBatch(
				this.batchSrcs,
				this.batchColumns ?? undefined,
			);
		if (!this.root || !this.baseId) return null;
		return layoutTree(this.root, this.byId, this.baseId);
	}

	get aspect() {
		const { layout } = this;
		if (!layout) return aspects.empty;
		return Math.min(
			Math.max(
				layout.width / Math.max(layout.height, 1),
				aspects.min,
			),
			aspects.max,
		);
	}

	get modeIndex() {
		return this.batch ? 1 : 0;
	}

	get base() {
		return (this.baseId && this.byId.get(this.baseId)) || undefined;
	}

	get baseDetail() {
		const { base } = this;
		return base ? `Base · ${pixels(base.w, base.h)}` : 'Base';
	}

	get selectedLeaf() {
		return this.selected && this.root
			? findLeaf(this.root, this.selected)
			: undefined;
	}

	get tile() {
		const leaf = this.selectedLeaf;
		const src = leaf && this.byId.get(leaf.srcId);
		if (!leaf || !src) return undefined;
		const isBase = leaf.srcId === this.baseId;
		return {
			name: src.name,
			size: pixels(src.w, src.h),
			fit: FITS.indexOf(leaf.fit),
			isBase,
		};
	}

	get first(): Target {
		return this.batch
			? { kind: 'batch', at: this.batchIds.length }
			: { kind: 'first' };
	}

	get defaultTarget(): Target {
		if (this.batch)
			return { kind: 'batch', at: this.batchIds.length };
		return this.root
			? { kind: 'add', node: this.selected, side: 'right' }
			: { kind: 'first' };
	}

	get tiles() {
		const { layout } = this;
		const size = layout
			? exportSize(layout.width, layout.height)
			: undefined;
		const sizeTile = {
			label: 'Size',
			value: size ? pixels(size.width, size.height) : dash,
		};
		if (!this.batch)
			return [
				sizeTile,
				{
					label: 'Tiles',
					value: layout
						? `${layout.ops.length}`
						: dash,
				},
			];
		const cell = layout?.ops[0]?.dest;
		const grid = layout && batchGrid(layout);
		return [
			sizeTile,
			{
				label: 'Grid',
				value: grid
					? `${grid.columns} × ${grid.rows}`
					: dash,
			},
			{
				label: 'Cell',
				value: cell
					? pixels(cell.width, cell.height)
					: dash,
			},
		];
	}

	get pages(): CanonPage[] {
		const srcs = this.batchSrcs;
		const first = srcs[0];
		if (!first) return [];
		const size = { width: first.w, height: first.h };
		return srcs.map((src) => {
			const scale = Math.max(
				first.w / src.w,
				first.h / src.h,
			);
			const width = src.w * scale;
			const height = src.h * scale;
			return {
				size,
				placement: {
					x: (first.w - width) / 2,
					y: (first.h - height) / 2,
					width,
					height,
				},
				picture: src.url,
				name: src.name,
			};
		});
	}

	get blankBatch() {
		return this.batchIds.length === 0;
	}

	get emptyBatch() {
		return this.batch && this.blankBatch;
	}

	get formatIndex() {
		return formats.findIndex((f) => f.id === this.format);
	}

	get formatDisabled() {
		return jxlAvailable()
			? []
			: [formats.findIndex((f) => f.id === 'jxl')];
	}

	get formatLabel() {
		return formats[this.formatIndex]!.label;
	}

	get exportDisabled() {
		return !this.layout || this.exporting;
	}

	get stem() {
		const name = this.batch
			? this.batchSrcs[0]?.name
			: this.base?.name;
		return name || 'image';
	}

	#spring() {
		if (reducedMotion()) return;
		this.springs = true;
		window.clearTimeout(this.#timer);
		this.#timer = window.setTimeout(
			() => (this.springs = false),
			springMs,
		);
	}

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = (target: Target) => {
		this.#pending = target;
		this.#input?.click();
	};

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		void this.add(files, this.#pending);
	};

	pasteInto = async (target: Target) =>
		this.add(await clipboardImages(), target);

	pasted = (file: File) => void this.add([file], this.defaultTarget);

	droppedInZone = (files: File[]) =>
		void this.add(files, this.defaultTarget);

	dropInPicture = (target: Target, files: File[]) =>
		void this.add(files, target);

	dropInStrip = (at: number, files: File[]) =>
		void this.add(files, { kind: 'batch', at });

	add(files: File[], target: Target) {
		const images = files.filter((f) => f.type.startsWith('image/'));
		if (!images.length) return this.#adding;
		this.loads++;
		this.#adding = this.#adding.then(async () => {
			const results = await Promise.allSettled(
				images.map(loadImage),
			);
			const added = results.flatMap((r) =>
				r.status === 'fulfilled' ? [r.value] : [],
			);
			if (isDestroying(this)) {
				added.forEach((s) =>
					URL.revokeObjectURL(s.url),
				);
				return;
			}
			this.loads--;
			this.srcs = [...this.srcs, ...added];
			this.#place(added, target);
		});
		return this.#adding;
	}

	#place(added: Src[], target: Target) {
		const firstAdded = added[0];
		if (!firstAdded) return;
		const leaves = added.map((s) => leaf(s.id));
		const { root } = this;
		if (
			target.kind === 'first' &&
			added.length > 1 &&
			splitterGrid(added.map((s) => s.name))
		) {
			this.batch = true;
			target = { kind: 'batch', at: this.batchIds.length };
		}
		if (target.kind === 'batch') {
			const ids = [...this.batchIds];
			ids.splice(
				Math.min(Math.max(0, target.at), ids.length),
				0,
				...added.map((s) => s.id),
			);
			this.#arrange(ids);
		} else if (!root) {
			this.baseId = firstAdded.id;
			this.root =
				leaves.length === 1
					? leaves[0]!
					: {
							kind: 'split',
							key: `r${nextId++}`,
							dir: 'row',
							children: leaves,
						};
		} else if (target.kind === 'insert') {
			this.root = insertIntoSplit(
				root,
				target.split,
				target.at,
				leaves,
			);
		} else {
			this.root = wrapNode(
				root,
				target.kind === 'add' ? target.node : null,
				target.kind === 'add' ? target.side : 'right',
				leaves,
			);
		}
		if (
			target.kind !== 'batch' &&
			this.root &&
			!leafSrcIds(this.root).includes(firstAdded.id)
		)
			this.root = wrapNode(this.root, null, 'right', leaves);
		this.#spring();
	}

	#arrange(ids: string[]) {
		const grid = splitterGrid(
			ids.map((id) => this.byId.get(id)?.name ?? ''),
		);
		this.batchColumns = grid?.columns ?? null;
		this.batchIds = grid ? grid.order.map((i) => ids[i]!) : ids;
	}

	#forget(ids: string[]) {
		const gone = new Set(ids);
		for (const s of this.srcs)
			if (gone.has(s.id)) URL.revokeObjectURL(s.url);
		this.srcs = this.srcs.filter((s) => !gone.has(s.id));
	}

	pickMode = (index: number) => {
		this.batch = index === 1;
	};

	select = (key: string | null) => {
		this.selected = key === this.selected ? null : key;
	};

	escape = modifier((element: HTMLElement) => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') this.selected = null;
		};
		element.ownerDocument.addEventListener('keydown', onKeyDown);
		return () =>
			element.ownerDocument.removeEventListener(
				'keydown',
				onKeyDown,
			);
	});

	drag = (key: string, drop: TileDrop) => {
		if (this.batch) {
			this.batchIds = batchDrop(this.batchIds, key, drop);
			this.#spring();
			return;
		}
		const { root } = this;
		if (!root) return;
		if (drop.kind === 'swap') {
			this.root = swapLeafContent(root, key, drop.key);
			if (this.selected === key) this.selected = drop.key;
			else if (this.selected === drop.key)
				this.selected = key;
		} else {
			this.root = moveLeafNode(
				root,
				key,
				drop.key,
				drop.side,
			);
		}
		this.#spring();
	};

	pickFit = (index: number) => {
		const fit: Fit | undefined = FITS[index];
		if (!fit || !this.root || !this.selected) return;
		this.root = settingFit(this.root, this.selected, fit);
		this.#spring();
	};

	makeBase = () => {
		const leaf = this.selectedLeaf;
		if (!leaf) return;
		this.baseId = leaf.srcId;
		this.#spring();
	};

	removeTile = () => {
		const leaf = this.selectedLeaf;
		if (!leaf || !this.root) return;
		this.root = removeLeafNode(this.root, leaf.key);
		this.selected = null;
		this.#forget([leaf.srcId]);
		if (this.baseId === leaf.srcId)
			this.baseId = this.root
				? (leafSrcIds(this.root)[0] ?? null)
				: null;
		this.#spring();
	};

	clear = () => {
		if (this.batch) {
			this.#forget(this.batchIds);
			this.batchIds = [];
			this.batchColumns = null;
		} else {
			if (this.root) this.#forget(leafSrcIds(this.root));
			this.root = null;
			this.baseId = null;
			this.selected = null;
		}
	};

	move = (from: number, to: number) => {
		const ids = [...this.batchIds];
		const [id] = ids.splice(from, 1);
		if (id === undefined || to < 0 || to > ids.length) return;
		ids.splice(to, 0, id);
		this.batchIds = ids;
		this.#spring();
	};

	sort = (ascending: boolean) => {
		const name = (id: string) => this.byId.get(id)?.name ?? '';
		this.batchIds = [...this.batchIds].sort((a, b) => {
			const order = name(a).localeCompare(
				name(b),
				undefined,
				{
					numeric: true,
				},
			);
			return ascending ? order : -order;
		});
		this.#spring();
	};

	sortUp = () => this.sort(true);
	sortDown = () => this.sort(false);

	menu = (at: number): CanonPageMenuItem[] | undefined => {
		const id = this.batchIds[at];
		if (id === undefined) return undefined;
		const moveTo = (start: boolean) => {
			const from = this.batchIds.indexOf(id);
			if (from >= 0)
				this.move(
					from,
					start ? 0 : this.batchIds.length - 1,
				);
		};
		return [
			{ title: 'Move to start', action: () => moveTo(true) },
			{ title: 'Move to end', action: () => moveTo(false) },
			{
				title: 'Remove',
				destructive: true,
				action: () => {
					this.batchIds = this.batchIds.filter(
						(x) => x !== id,
					);
					this.#forget([id]);
				},
			},
		];
	};

	pickFormat = (index: number) => {
		this.format = formats[index]?.id ?? this.format;
	};

	async #render(format: ExportFormat) {
		const { layout } = this;
		if (!layout || this.exporting) return undefined;
		this.exporting = true;
		try {
			return await encode(render(layout, format), format);
		} catch (err) {
			console.error('stitch export failed', err);
			return undefined;
		} finally {
			if (!isDestroying(this)) this.exporting = false;
		}
	}

	copy = async () => {
		const blob = await this.#render('png');
		if (!blob) return;
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
		} catch {
			return;
		}
		this.toast.show();
	};

	export = async () => {
		const { format } = this;
		const blob = await this.#render(format);
		const meta = formats[this.formatIndex]!;
		if (blob)
			downloadBlob(blob, `${this.stem}-stitched.${meta.ext}`);
	};

	async #script(files: File[], script: string) {
		await this.add(files, { kind: 'batch', at: 0 });
		const pool = [...this.srcs];
		this.batchIds = [];
		const list = (text: string) =>
			text === 'all'
				? pool
				: text
						.split(',')
						.map((i) => pool[Number(i)])
						.filter((s): s is Src => !!s);
		const key = (text: string) => {
			const src = pool[Number(text)];
			return src && this.root
				? leafKeyOf(this.root, src.id)
				: undefined;
		};
		for (const op of script.split(';')) {
			const [name, a = '', b = '', c = ''] = op.split(':');
			switch (name) {
				case 'seed':
					this.#place(list(a), { kind: 'first' });
					break;
				case 'add': {
					const side = sides[b];
					if (side)
						this.#place(list(c), {
							kind: 'add',
							node:
								a === '*'
									? null
									: (key(
											a,
										) ??
										null),
							side,
						});
					break;
				}
				case 'insert': {
					const seam =
						this.layout?.seams[Number(a)];
					if (seam)
						this.#place(list(b), {
							kind: 'insert',
							split: seam.splitKey,
							at: seam.at,
						});
					break;
				}
				case 'swap': {
					const from = key(a);
					const to = key(b);
					if (from && to)
						this.drag(from, {
							kind: 'swap',
							key: to,
						});
					break;
				}
				case 'place': {
					const from = key(a);
					const to = key(b);
					const side = sides[c];
					if (from && to && side)
						this.drag(from, {
							kind: 'place',
							key: to,
							side,
						});
					break;
				}
				case 'fit':
					this.selected = key(a) ?? null;
					this.pickFit(FITS.indexOf(b as Fit));
					break;
				case 'select':
					this.selected = key(a) ?? null;
					break;
				case 'deselect':
					this.selected = null;
					break;
				case 'remove':
					this.selected = key(a) ?? null;
					this.removeTile();
					break;
				case 'base':
					this.selected = key(a) ?? null;
					this.makeBase();
					break;
				case 'batch':
					this.#place(list(a), {
						kind: 'batch',
						at: this.batchIds.length,
					});
					break;
				case 'move':
					this.move(Number(a), Number(b));
					break;
				case 'mode':
					this.batch = a === 'batch';
					break;
			}
		}
		const used = new Set([
			...this.batchIds,
			...(this.root ? leafSrcIds(this.root) : []),
		]);
		this.#forget(
			this.srcs
				.filter((s) => !used.has(s.id))
				.map((s) => s.id),
		);
	}

	<template>
		<CanonSplit
			class="image-stitcher"
			@halves={{true}}
			@collapsesTo={{240}}
			style={{spring}}
			{{filePaste this.pasted accept="image/*"}}
			{{this.escape}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{this.aspect}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@springs={{this.springs}}
						@layout={{this.layout}}
						@batch={{this.batch}}
						@selected={{this.selected}}
						@loading={{if
							this.loads
							true
							false
						}}
						@over={{this.drop.over}}
						@first={{this.first}}
						@onChoose={{this.choose}}
						@onPaste={{this.pasteInto}}
						@onSelect={{this.select}}
						@onDrag={{this.drag}}
						@onDropFiles={{this.dropInPicture}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Mode" />
					<CanonSegmented
						class="stitch-modes"
						@items={{modes}}
						@selected={{this.modeIndex}}
						@onChange={{this.pickMode}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Images" />
					{{#if this.emptyBatch}}
						<CanonPageStrip
							class="stitch-strip stitch-strip--blank"
							style={{stripStyle}}
							@pages={{BLANK_PAGES}}
							@blank={{true}}
						/>
					{{else if this.batch}}
						<CanonPageStrip
							class="stitch-strip"
							style={{stripStyle}}
							@pages={{this.pages}}
							@reorders={{true}}
							@onMove={{this.move}}
							@onDrop={{this.dropInStrip}}
							@menu={{this.menu}}
						/>
					{{else}}
						<CanonRow
							class="stitch-base"
							@title={{if
								this.base
								this.base.name
								dash
							}}
							@detail={{this.baseDetail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{if
									this.root
									false
									true
								}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{/if}}
					<CanonDropZone
						class="stitch-drop"
						@prompt="Drop images here"
						@multiple={{true}}
						@onFiles={{this.droppedInZone}}
						{{on "paste" keepPaste}}
					/>
					{{#if this.batch}}
						<CanonGrid class="stitch-order">
							<CanonButton
								class="stitch-sort-up"
								@kind="cell"
								@text="A–Z"
								@icon={{SortUp}}
								@disabled={{this.blankBatch}}
								@onClick={{this.sortUp}}
							/>
							<CanonButton
								class="stitch-sort-down"
								@kind="cell"
								@text="Z–A"
								@icon={{SortDown}}
								@disabled={{this.blankBatch}}
								@onClick={{this.sortDown}}
							/>
							<CanonButton
								class="stitch-clear"
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{this.blankBatch}}
								@onClick={{this.clear}}
							/>
						</CanonGrid>
					{{/if}}
				</CanonRows>
				{{#unless this.batch}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Tile" />
						{{#if this.tile}}
							<CanonRow
								class="stitch-tile-row"
								@title={{this.tile.name}}
								@detail={{this.tile.size}}
							/>
							<CanonHeading
								@text="Fit"
							/>
							<CanonSegmented
								class="stitch-fit"
								@items={{fitLabels}}
								@selected={{this.tile.fit}}
								@disabled={{this.tile.isBase}}
								@onChange={{this.pickFit}}
							/>
							<CanonGrid>
								<CanonButton
									class="stitch-make-base"
									@kind="cell"
									@text={{if
										this.tile.isBase
										"Base"
										"Make base"
									}}
									@icon={{Pin}}
									@disabled={{this.tile.isBase}}
									@onClick={{this.makeBase}}
								/>
								<CanonButton
									class="stitch-remove"
									@kind="cell"
									@text="Remove"
									@icon={{Trash}}
									@onClick={{this.removeTile}}
								/>
							</CanonGrid>
						{{else}}
							<CanonStatus
								class="stitch-no-tile"
								@text="Tap a tile"
								@tone="muted"
								@row={{true}}
							/>
						{{/if}}
					</CanonRows>
				{{/unless}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Output" />
					<CanonTiles @items={{this.tiles}} />
					<CanonHeading @text="Format" />
					<CanonSegmented
						class="stitch-formats"
						@items={{formatLabels}}
						@selected={{this.formatIndex}}
						@disabledIndices={{this.formatDisabled}}
						@onChange={{this.pickFormat}}
					/>
					<CanonGrid>
						<CanonButton
							class="stitch-copy"
							@text="Copy"
							@icon={{Copy}}
							@disabled={{this.exportDisabled}}
							@onClick={{this.copy}}
						/>
						<CanonButton
							class="stitch-download"
							@kind="primary"
							@text={{passAlong
								(concat
									"Download "
									this.formatLabel
								)
							}}
							@icon={{Save}}
							@iconStyle="oversized"
							@disabled={{this.exportDisabled}}
							@onClick={{this.export}}
						/>
					</CanonGrid>
					{{#if this.exporting}}
						<CanonRow
							class="stitch-busy"
							@title="Processing…"
						>
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
					{{/if}}
				</CanonRows>
				{{! template-lint-disable require-input-label }}
				<input
					type="file"
					accept="image/*"
					multiple
					hidden
					{{this.keepInput}}
					{{on "change" this.picked}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
