import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { array, fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import type { PDFDocument } from 'pdf-lib';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
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
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/pdf-compress';
import {
	everyPageAlone,
	normaliseRotation,
	parsePageRanges,
} from 'delphitools-v2/lib/pdf-pages';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { open, thumbnails } from 'delphitools-v2/lib/pdfjs';
import {
	moved,
	partLabel,
	partNames,
	turned,
	type Size,
} from 'delphitools-v2/components/tools/pdf-organiser/plan';
import './media/media.css';
import './pdf-organiser/pdf-organiser.css';

const ACCEPT = '.pdf,application/pdf';
const modes = ['By ranges', 'Every page'];
const dropTypes = ['application/pdf'];

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Merge = <template><IconSvg @name="file-stack" /></template>;
const Cut = <template><IconSvg @name="scissors-line-dashed" /></template>;
const Left = <template><IconSvg @name="rotate-ccw" /></template>;
const Right = <template><IconSvg @name="rotate-cw" /></template>;
const ROTATE_ROWS = [
	{ class: 'porg-rotate-picked', title: 'Selected', all: false },
	{ class: 'porg-rotate-all', title: 'All pages', all: true },
];

interface Source {
	id: number;
	name: string;
	stem: string;
	bytes: number;
	lib: PDFDocument;
	sizes: Size[];
	pictures: string[];
}

interface Entry {
	id: number;
	source: number;
	page: number;
	rotation: number;
}

interface Merged {
	blob: Blob;
	name: string;
	pages: number;
}

let nextId = 1;

const query = (name: string) =>
	new URLSearchParams(window.location.search).get(name);

const pagesLabel = (n: number) => (n === 1 ? '1 page' : `${n} pages`);

export default class PdfOrganiser extends Component {
	drop = new Drop(ACCEPT, (files) => this.add(files), true);

	@tracked sources: Source[] = [];
	@tracked entries: Entry[] = [];
	@tracked reading = 0;
	@tracked readFailure = '';
	@tracked every = query('orgMode') === '1';
	@tracked rangeSpec = query('orgRanges') ?? '';
	@tracked merging = false;
	@tracked mergeFailed = false;
	@tracked merged: Merged | null = null;
	@tracked splitting = false;
	@tracked splitFailed = false;
	@tracked picked: number[] = [];

	#strip?: HTMLElement;
	#job = 0;
	#extend = false;

	willDestroy() {
		super.willDestroy();
		for (const source of this.sources) release(source);
	}

	get busy() {
		return this.merging || this.splitting;
	}

	get modeIndex() {
		return this.every ? 1 : 0;
	}

	get baseName() {
		return this.sources[0]?.stem || 'merged';
	}

	#source(id: number) {
		return this.sources.find((source) => source.id === id);
	}

	#page(entry: Entry, depth = 0, name?: string): CanonPage | null {
		const source = this.#source(entry.source);
		const size = source?.sizes[entry.page];
		if (!source || !size) return null;
		return {
			size: turned(size, entry.rotation),
			picture: source.pictures[entry.page] || undefined,
			turn: entry.rotation,
			depth,
			name,
		};
	}

	get pages(): CanonPage[] {
		return this.entries.flatMap((entry) => {
			const stem = this.#source(entry.source)?.stem;
			return (
				this.#page(
					entry,
					0,
					`${stem} p. ${entry.page + 1}`,
				) ?? []
			);
		});
	}

	get fileRows() {
		return this.sources.map((source) => ({
			source,
			detail: `${pagesLabel(source.sizes.length)} · ${formatBytes(source.bytes)}`,
		}));
	}

	get parsed(): { groups: number[][]; error: string } {
		const count = this.entries.length;
		if (this.every)
			return { groups: everyPageAlone(count), error: '' };
		if (this.rangeSpec.trim() === '')
			return { groups: [], error: '' };
		try {
			return {
				groups: parsePageRanges(this.rangeSpec, count),
				error: '',
			};
		} catch (error) {
			return { groups: [], error: (error as Error).message };
		}
	}

	get parts(): CanonPage[] {
		return this.parsed.groups.flatMap((group) => {
			const entry = this.entries[group[0]!];
			return (
				(entry &&
					this.#page(
						entry,
						group.length - 1,
						partLabel(group),
					)) ??
				[]
			);
		});
	}

	get splitLabel() {
		const count = this.parsed.groups.length;
		return count < 2 ? 'Download part' : `Download ${count} parts`;
	}

	get cannotSplit() {
		return this.busy || this.parsed.groups.length === 0;
	}

	get mergedRow() {
		const merged = this.merged;
		if (!merged) return null;
		return {
			name: merged.name,
			detail: `${pagesLabel(merged.pages)} · ${formatBytes(merged.blob.size)}`,
		};
	}

	#queue: Promise<void> = Promise.resolve();

	add = (files: File[], at = Infinity) => {
		const pdfs = files.filter((file) =>
			matchesAccept(file, ACCEPT),
		);
		if (!pdfs.length || this.busy) return;
		this.readFailure = '';
		this.reading += pdfs.length;
		this.#queue = this.#queue.then(() => this.#read(pdfs, at));
	};

	paste = (file: File) => this.add([file]);

	async #read(files: File[], at: number) {
		let insertAt = at;
		for (const file of files) {
			const source = await load(file).catch(() => null);
			if (this.isDestroyed) return;
			this.reading--;
			if (!source) {
				this.readFailure = `Could not read ${file.name}`;
				continue;
			}
			this.sources = [...this.sources, source];
			const added = source.sizes.map((_, page) => ({
				id: nextId++,
				source: source.id,
				page,
				rotation: 0,
			}));
			const next = [...this.entries];
			next.splice(
				Math.min(insertAt, next.length),
				0,
				...added,
			);
			insertAt += added.length;
			this.#change(next);
			void this.#draw(file, source.id);
		}
	}

	async #draw(file: File, id: number) {
		const live = () => !this.isDestroyed && !!this.#source(id);
		const pdf = await open(await file.arrayBuffer()).catch(
			() => null,
		);
		if (!pdf) return;
		await thumbnails(pdf, live, (page, url) => {
			this.sources = this.sources.map((source) => {
				if (source.id !== id) return source;
				const pictures = [...source.pictures];
				pictures[page] = url;
				return { ...source, pictures };
			});
		});
		void pdf.destroy();
	}

	remove = (id: number) => {
		const source = this.#source(id);
		if (!source || this.busy) return;
		release(source);
		this.sources = this.sources.filter((s) => s.id !== id);
		this.#change(
			this.entries.filter((entry) => entry.source !== id),
		);
	};

	#change(entries: Entry[]) {
		this.entries = entries;
		this.picked = this.picked.filter((id) =>
			entries.some((entry) => entry.id === id),
		);
		this.#job++;
		this.merged = null;
		this.merging = false;
		this.mergeFailed = false;
	}

	move = (from: number, to: number) => {
		if (this.busy) return;
		this.#change(moved(this.entries, from, to));
	};

	insert = (index: number, files: File[]) => this.add(files, index);

	#act(id: number, body: (entries: Entry[], at: number) => void) {
		const at = this.entries.findIndex((entry) => entry.id === id);
		if (at < 0 || this.busy) return;
		const next = [...this.entries];
		body(next, at);
		this.#change(next);
	}

	menu = (index: number): CanonPageMenuItem[] | undefined => {
		const id = this.entries[index]?.id;
		if (id === undefined || this.busy) return undefined;
		const act =
			(body: (entries: Entry[], at: number) => void) => () =>
				this.#act(id, body);
		const toEdge = (start: boolean) =>
			act((entries, at) => {
				const [entry] = entries.splice(at, 1);
				if (start) entries.unshift(entry!);
				else entries.push(entry!);
			});
		return [
			{
				title: 'Rotate',
				action: act((entries, at) => {
					const entry = entries[at]!;
					entries[at] = {
						...entry,
						rotation: normaliseRotation(
							entry.rotation + 90,
						),
					};
				}),
			},
			{
				title: 'Duplicate',
				action: act((entries, at) => {
					entries.splice(at + 1, 0, {
						...entries[at]!,
						id: nextId++,
					});
				}),
			},
			{ title: 'Move to start', action: toEdge(true) },
			{ title: 'Move to end', action: toEdge(false) },
			{
				title: 'Remove',
				destructive: true,
				action: act((entries, at) =>
					entries.splice(at, 1),
				),
			},
		];
	};

	#button(index: number) {
		return this.#strip?.querySelector<HTMLElement>(
			`[data-page-index="${index}"] .canon-page-strip-page`,
		);
	}

	get pickedIndices() {
		const picked = new Set(this.picked);
		return this.entries.flatMap((entry, index) =>
			picked.has(entry.id) ? [index] : [],
		);
	}

	get lastPicked() {
		const id = this.picked.at(-1);
		const index = this.entries.findIndex(
			(entry) => entry.id === id,
		);
		return index < 0 ? undefined : index;
	}

	get nothingPicked() {
		return this.busy || this.pickedIndices.length === 0;
	}

	get noPages() {
		return this.busy || this.entries.length === 0;
	}

	rotate = (delta: number, all: boolean) => {
		if (this.busy) return;
		const picked = new Set(this.picked);
		this.#change(
			this.entries.map((entry) =>
				all || picked.has(entry.id)
					? {
							...entry,
							rotation: normaliseRotation(
								entry.rotation +
									delta,
							),
						}
					: entry,
			),
		);
	};

	markPicked = modifier((strip: HTMLElement, [indices]: [number[]]) => {
		const picked = new Set(indices);
		const mark = () => {
			for (const cell of strip.querySelectorAll<HTMLElement>(
				'[data-page-index]',
			))
				cell.toggleAttribute(
					'data-picked',
					picked.has(
						Number(
							cell.dataset[
								'pageIndex'
							],
						),
					),
				);
		};
		mark();
		if (!picked.size) return;
		const observer = new MutationObserver(mark);
		observer.observe(strip, { childList: true, subtree: true });
		return () => observer.disconnect();
	});

	select = (index: number) => {
		const id = this.entries[index]?.id;
		if (id === undefined) return;
		if (this.#extend) {
			this.picked = this.picked.includes(id)
				? this.picked.filter((picked) => picked !== id)
				: [...this.picked, id];
			return;
		}
		this.picked = [id];
		this.#button(index)?.dispatchEvent(
			new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
			}),
		);
	};

	stripKeys = modifier((strip: HTMLElement) => {
		this.#strip = strip;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Delete' && event.key !== 'Backspace')
				return;
			const cell = (
				event.target as HTMLElement
			).closest<HTMLElement>('[data-page-index]');
			const id =
				this.entries[Number(cell?.dataset['pageIndex'])]
					?.id;
			if (!cell || id === undefined || this.busy) return;
			event.preventDefault();
			const index = Number(cell.dataset['pageIndex']);
			this.#act(id, (entries, at) => entries.splice(at, 1));
			requestAnimationFrame(() =>
				this.#button(
					Math.min(
						index,
						this.entries.length - 1,
					),
				)?.focus(),
			);
		};
		const onClick = (event: MouseEvent) => {
			this.#extend =
				event.shiftKey ||
				event.metaKey ||
				event.ctrlKey;
		};
		strip.addEventListener('keydown', onKey);
		strip.addEventListener('click', onClick, true);
		return () => {
			strip.removeEventListener('keydown', onKey);
			strip.removeEventListener('click', onClick, true);
		};
	});

	pickMode = (index: number) => {
		this.every = index === 1;
		this.splitFailed = false;
	};

	setRanges = (value: string) => {
		this.rangeSpec = value;
		this.splitFailed = false;
	};

	async #build(entries: Entry[]): Promise<Uint8Array> {
		const { PDFDocument, degrees } = await import('pdf-lib');
		const out = await PDFDocument.create();
		for (const entry of entries) {
			const source = this.#source(entry.source)!;
			const [copied] = await out.copyPages(source.lib, [
				entry.page,
			]);
			const page = out.addPage(copied);
			page.setRotation(
				degrees(
					normaliseRotation(
						page.getRotation().angle +
							entry.rotation,
					),
				),
			);
		}
		return out.save();
	}

	merge = () => void this.#merge();

	async #merge() {
		if (this.busy || !this.entries.length) return;
		const job = ++this.#job;
		const entries = this.entries;
		this.merging = true;
		this.mergeFailed = false;
		try {
			const bytes = await this.#build(entries);
			if (job !== this.#job) return;
			this.merged = {
				blob: pdfBlob(bytes),
				name: `${this.baseName}-merged.pdf`,
				pages: entries.length,
			};
		} catch {
			if (job === this.#job) this.mergeFailed = true;
		} finally {
			if (job === this.#job) this.merging = false;
		}
	}

	saveMerged = () => {
		if (this.merged)
			downloadBlob(this.merged.blob, this.merged.name);
	};

	split = () => void this.#split();

	async #split() {
		const { groups } = this.parsed;
		if (this.busy || !groups.length) return;
		const base = this.baseName;
		const names = partNames(groups, base, this.every);
		this.splitting = true;
		this.splitFailed = false;
		try {
			const outputs = [];
			for (const [index, group] of groups.entries()) {
				outputs.push({
					name: names[index]!,
					bytes: await this.#build(
						group.map(
							(page) =>
								this.entries[
									page
								]!,
						),
					),
				});
			}
			if (outputs.length === 1) {
				downloadBlob(
					pdfBlob(outputs[0]!.bytes),
					outputs[0]!.name,
				);
				return;
			}
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			for (const output of outputs)
				zip.file(output.name, output.bytes);
			const blob = await zip.generateAsync({ type: 'blob' });
			if (!this.isDestroyed)
				downloadBlob(blob, `${base}-split.zip`);
		} catch {
			this.splitFailed = true;
		} finally {
			if (!this.isDestroyed) this.splitting = false;
		}
	}

	<template>
		<CanonSplit
			class="pdf-organiser"
			{{filePaste this.paste accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@height={{pageStripHeight}}
					@background="var(--canon-muted)"
				>
					{{#if this.entries.length}}
						<CanonPageStrip
							class="porg-strip"
							@pages={{this.pages}}
							@reorders={{if
								this.busy
								false
								true
							}}
							@dropTypes={{dropTypes}}
							@onMove={{this.move}}
							@onDrop={{this.insert}}
							@onSelect={{this.select}}
							@selected={{this.lastPicked}}
							@menu={{this.menu}}
							{{this.stripKeys}}
							{{this.markPicked
								this.pickedIndices
							}}
						/>
					{{else}}
						<CanonPageStrip
							class="porg-blank"
							@pages={{(array)}}
							@blank={{true}}
						/>
					{{/if}}
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Files" />
					{{#each
						this.fileRows key="source.id"
						as |row|
					}}
						<CanonRow
							class="porg-file"
							@title={{row.source.name}}
							@detail={{row.detail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{this.busy}}
								@onClick={{fn
									this.remove
									row.source.id
								}}
							/>
						</CanonRow>
					{{/each}}
					{{#if this.reading}}
						<CanonRow
							class="porg-reading"
							@title="Processing…"
						>
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.readFailure}}
						<CanonStatus
							class="porg-read-failure"
							@text={{this.readFailure}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<Slot
						class="porg-slot"
						@prompt="Drop PDFs here"
						@icon="file-stack"
						@row={{true}}
						@multiple={{true}}
						@accept={{ACCEPT}}
						@over={{this.drop.over}}
						@onFiles={{this.add}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}} class="porg-rotate">
					<CanonHeading @text="Rotate" />
					{{#each ROTATE_ROWS as |row|}}
						<CanonRow
							class={{row.class}}
							@title={{row.title}}
							@form="flush"
						>
							<CanonGrid>
								<CanonButton
									@kind="cell"
									@icon={{Left}}
									@label="Rotate left"
									@disabled={{if
										row.all
										this.noPages
										this.nothingPicked
									}}
									@onClick={{fn
										this.rotate
										-90
										row.all
									}}
								/>
								<CanonButton
									@kind="cell"
									@icon={{Right}}
									@label="Rotate right"
									@disabled={{if
										row.all
										this.noPages
										this.nothingPicked
									}}
									@onClick={{fn
										this.rotate
										90
										row.all
									}}
								/>
							</CanonGrid>
						</CanonRow>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Merge" />
					<Job
						@title="Export Merged"
						@icon={{Merge}}
						@failure="Merge failed"
						@disabled={{if
							this.entries.length
							false
							true
						}}
						@busy={{this.merging}}
						@failed={{this.mergeFailed}}
						@result={{this.mergedRow}}
						@onRun={{this.merge}}
						@onSave={{this.saveMerged}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Split" />
					<CanonSegmented
						class="porg-modes"
						@items={{modes}}
						@selected={{this.modeIndex}}
						@onChange={{this.pickMode}}
					/>
					{{#unless this.every}}
						<CanonRow
							class="porg-ranges"
							@title="Ranges"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.rangeSpec}}
								@placeholder="1-3, 7-9"
								@onChange={{this.setRanges}}
								aria-labelledby={{titleId}}
								inputmode="text"
								autocomplete="off"
								spellcheck="false"
							/>
						</CanonRow>
						{{#if this.parsed.error}}
							<CanonStatus
								class="porg-range-error"
								@text={{this.parsed.error}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					{{/unless}}
				</CanonRows>
				<CanonCanvas
					class="porg-parts"
					@height={{pageStripHeight}}
					@boxing="unlessWide"
					@background="var(--canon-muted)"
				>
					<CanonPageStrip
						@pages={{this.parts}}
						@empty="Parts"
					/>
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<CanonButton
						class="porg-split"
						@text={{this.splitLabel}}
						@icon={{Cut}}
						@disabled={{this.cannotSplit}}
						@onClick={{this.split}}
					/>
					{{#if this.splitting}}
						<CanonRow
							class="porg-splitting"
							@title="Processing…"
						>
							<CanonLoader
								@cell={{5}}
								@gap={{1}}
							/>
						</CanonRow>
					{{/if}}
					{{#if this.splitFailed}}
						<CanonStatus
							class="porg-split-failed"
							@text="Split failed"
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}

async function load(file: File): Promise<Source> {
	const { PDFDocument } = await import('pdf-lib');
	const bytes = await file.arrayBuffer();
	const lib = await PDFDocument.load(bytes, { ignoreEncryption: true });
	const sizes = lib.getPages().map((page) => {
		const { width, height } = page.getCropBox();
		return turned({ width, height }, page.getRotation().angle);
	});
	if (!sizes.length) throw new Error('no pages');
	return {
		id: nextId++,
		name: file.name,
		stem: file.name.replace(/\.pdf$/i, ''),
		bytes: file.size,
		lib,
		sizes,
		pictures: [],
	};
}

function release(source: Source) {
	for (const url of source.pictures) if (url) URL.revokeObjectURL(url);
}

function pdfBlob(bytes: Uint8Array) {
	return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}
