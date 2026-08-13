import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not, or } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import {
	everyPageAlone,
	normaliseRotation,
	parsePageRanges,
} from 'delphitools-v2/lib/pdf-pages';
import { getPdfJs } from 'delphitools-v2/lib/pdfjs';
import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const ACCEPT = '.pdf,application/pdf';

/** Width the page thumbnails are rendered at, in CSS pixels. */
const THUMB_WIDTH = 220;

type SplitMode = 'ranges' | 'pages';

interface SourceDoc {
	name: string;
	/** The pdf-lib parse of bytes; pdf.js gets a copy, it detaches its input. */
	lib: PDFDocument;
	pageCount: number;
}

interface PageEntry {
	id: number;
	/** Index into sources. */
	source: number;
	/** 0-based page index inside its source document. */
	page: number;
	/** Extra rotation applied on top of the page's own, in 90° steps. */
	rotation: number;
	/** Rendered thumbnail data URL, empty when pdf.js could not read it. */
	thumb: string;
}

interface SplitOutput {
	name: string;
	bytes: Uint8Array;
}

let nextId = 1;

export default class PdfOrganiserTool extends Component {
	@tracked sources: SourceDoc[] = [];
	@tracked pages: PageEntry[] = [];
	@tracked error: string | null = null;
	@tracked busy = false;
	/** Names of files still being parsed, shown while thumbs render. */
	@tracked loading: string[] = [];

	@tracked splitMode: SplitMode = 'ranges';
	@tracked rangeSpec = '';

	@tracked draggedId: number | null = null;
	@tracked dragOverId: number | null = null;

	get loaded() {
		return this.sources.length > 0;
	}

	get countLabel() {
		const files = this.sources.length;
		const pages = this.pages.length;
		return `${files} file${files === 1 ? '' : 's'} · ${pages} page${pages === 1 ? '' : 's'}`;
	}

	get baseName() {
		return this.sources[0]?.name.replace(/\.pdf$/i, '') || 'merged';
	}

	get parsedRanges(): {
		groups: number[][] | null;
		error: string | null;
	} {
		if (this.splitMode === 'pages') {
			return {
				groups: everyPageAlone(this.pages.length),
				error: null,
			};
		}
		// An untouched field is not an error, just nothing to split yet.
		if (this.rangeSpec.trim() === '')
			return { groups: null, error: null };
		try {
			return {
				groups: parsePageRanges(
					this.rangeSpec,
					this.pages.length,
				),
				error: null,
			};
		} catch (error) {
			return {
				groups: null,
				error: (error as Error).message,
			};
		}
	}

	get splitLabel() {
		const count = this.parsedRanges.groups?.length ?? 0;
		return count === 1
			? 'Download part'
			: `Download ${count} parts`;
	}

	get canSplit() {
		const groups = this.parsedRanges.groups;
		return (
			!this.busy &&
			this.pages.length > 0 &&
			groups !== null &&
			groups.length > 0
		);
	}

	pageLabel = (entry: PageEntry) => `p. ${entry.page + 1}`;

	rotationClass = (entry: PageEntry) =>
		entry.rotation ? `is-rot-${entry.rotation}` : '';

	sourceName = (entry: PageEntry) =>
		this.sources[entry.source]?.name ?? '';

	// ------------------------------------------------------------ intake

	readFile = (file: File) => this.#addFiles([file]);

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		this.#addFiles([...(input.files ?? [])]);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		this.#addFiles([...(event.dataTransfer?.files ?? [])]);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	#addFiles(files: File[]) {
		const pdfs = files.filter(
			(file) =>
				file.type === 'application/pdf' ||
				/\.pdf$/i.test(file.name),
		);
		if (pdfs.length === 0) return;
		this.error = null;
		for (const file of pdfs) void this.#loadSource(file);
	}

	async #loadSource(file: File) {
		this.loading = [...this.loading, file.name];
		try {
			const bytes = await file.arrayBuffer();
			const { PDFDocument } = await import('pdf-lib');
			const lib = await PDFDocument.load(bytes, {
				ignoreEncryption: true,
			});

			const pdfjs = await getPdfJs();
			const js: PDFDocumentProxy = await pdfjs.getDocument({
				// A copy: pdf.js detaches the buffer it is handed.
				data: bytes.slice(0),
			}).promise;

			const thumbs = await this.#renderThumbs(js);
			if (this.isDestroyed) return;

			// Captured late on purpose: files load concurrently, so the index
			// is only valid once this source is actually appended.
			const sourceIndex = this.sources.length;
			this.sources = [
				...this.sources,
				{
					name: file.name,
					lib,
					pageCount: lib.getPageCount(),
				},
			];
			this.pages = [
				...this.pages,
				...thumbs.map((thumb, index) => ({
					id: nextId++,
					source: sourceIndex,
					page: index,
					rotation: 0,
					thumb,
				})),
			];
		} catch {
			this.error = `Could not read ${file.name}`;
		} finally {
			if (!this.isDestroyed) {
				this.loading = this.loading.filter(
					(n) => n !== file.name,
				);
			}
		}
	}

	async #renderThumbs(js: PDFDocumentProxy): Promise<string[]> {
		try {
			const thumbs: string[] = [];
			for (let n = 1; n <= js.numPages; n++) {
				const page = await js.getPage(n);
				const base = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({
					scale: THUMB_WIDTH / base.width,
				});
				const canvas = document.createElement('canvas');
				canvas.width = Math.ceil(viewport.width);
				canvas.height = Math.ceil(viewport.height);
				await page.render({ canvas, viewport }).promise;
				thumbs.push(canvas.toDataURL('image/png'));
			}
			return thumbs;
		} catch {
			// Encrypted without a password, or a page pdf.js chokes on: the
			// cell falls back to an icon, and pdf-lib output still works.
			return Array.from({ length: js.numPages }, () => '');
		}
	}

	// ------------------------------------------------------- page edits

	rotatePage = (entry: PageEntry) => {
		this.#replacePage(entry, {
			rotation: normaliseRotation(entry.rotation + 90),
		});
	};

	deletePage = (entry: PageEntry) => {
		this.pages = this.pages.filter((page) => page.id !== entry.id);
	};

	#replacePage(entry: PageEntry, patch: Partial<PageEntry>) {
		this.pages = this.pages.map((page) =>
			page.id === entry.id ? { ...page, ...patch } : page,
		);
	}

	clearAll = () => {
		this.sources = [];
		this.pages = [];
		this.error = null;
	};

	// ------------------------------------------------------ drag reorder

	dragStart = (id: number, event: DragEvent) => {
		this.draggedId = id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(id));
		}
	};

	dragOver = (id: number, event: DragEvent) => {
		event.preventDefault();
		this.dragOverId = id === this.draggedId ? null : id;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect =
				this.draggedId === null ? 'copy' : 'move';
		}
	};

	dragEnd = () => {
		this.draggedId = null;
		this.dragOverId = null;
	};

	dropOnCell = (id: number, event: DragEvent) => {
		event.preventDefault();
		this.dragOverId = null;

		// A file dropped on the grid is intake, not a reorder.
		if (event.dataTransfer?.files.length) {
			this.draggedId = null;
			this.#addFiles([...event.dataTransfer.files]);
			return;
		}

		const from = this.pages.findIndex(
			(page) => page.id === this.draggedId,
		);
		this.draggedId = null;
		const to = this.pages.findIndex((page) => page.id === id);
		if (from < 0 || to < 0 || from === to) return;

		const next = [...this.pages];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved!);
		this.pages = next;
	};

	// ------------------------------------------------------------ output

	async #buildDoc(entries: PageEntry[]): Promise<Uint8Array> {
		const { PDFDocument, degrees } = await import('pdf-lib');
		const out = await PDFDocument.create();
		for (const entry of entries) {
			const source = this.sources[entry.source]!;
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

	#savePdf(bytes: Uint8Array, name: string) {
		// Copied into a fresh buffer: pdf-lib types its output over
		// ArrayBufferLike, which BlobPart does not accept.
		downloadBlob(
			new Blob([new Uint8Array(bytes)], {
				type: 'application/pdf',
			}),
			name,
		);
	}

	downloadMerged = async () => {
		if (this.busy || this.pages.length === 0) return;
		this.busy = true;
		try {
			this.#savePdf(
				await this.#buildDoc(this.pages),
				`${this.baseName}-merged.pdf`,
			);
		} catch {
			this.error = 'Merge failed';
		} finally {
			this.busy = false;
		}
	};

	downloadSplit = async () => {
		const groups = this.parsedRanges.groups;
		if (this.busy || !groups || groups.length === 0) return;
		this.busy = true;
		try {
			const outputs: SplitOutput[] = [];
			for (const [index, group] of groups.entries()) {
				const entries = group.map(
					(page) => this.pages[page]!,
				);
				const suffix =
					this.splitMode === 'pages'
						? `page-${group[0]! + 1}`
						: `part-${index + 1}`;
				outputs.push({
					name: `${this.baseName}-${suffix}.pdf`,
					bytes: await this.#buildDoc(entries),
				});
			}

			if (outputs.length === 1) {
				this.#savePdf(
					outputs[0]!.bytes,
					outputs[0]!.name,
				);
			} else {
				const { default: JSZip } =
					await import('jszip');
				const zip = new JSZip();
				for (const output of outputs) {
					zip.file(output.name, output.bytes);
				}
				const blob = await zip.generateAsync({
					type: 'blob',
				});
				if (this.isDestroyed) return;
				downloadBlob(
					blob,
					`${this.baseName}-split.zip`,
				);
			}
		} catch {
			this.error = 'Split failed';
		} finally {
			this.busy = false;
		}
	};

	setSplitMode = (mode: SplitMode) => (this.splitMode = mode);
	setRangeSpec = (event: Event) =>
		(this.rangeSpec = (event.target as HTMLInputElement).value);

	<template>
		<div class="dt-porg" {{filePaste this.readFile accept=ACCEPT}}>
			<div
				class="dt-porg-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				{{#unless this.loaded}}
					<label class="dt-porg-drop">
						<input
							type="file"
							accept={{ACCEPT}}
							multiple
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-porg-drop-title"
						>Drop PDFs here</span>
						<span
							class="dt-porg-drop-hint"
						>click or paste</span>
					</label>
				{{/unless}}

				{{#if this.loaded}}
					<div class="dt-porg-bar">
						<div class="dt-porg-info">
							<span
								class="dt-porg-count"
							>{{this.countLabel}}</span>
							{{#if
								this.loading.length
							}}
								<span
									class="dt-porg-reading"
								>Reading…</span>
							{{/if}}
						</div>
						<label class="dt-porg-btn">
							<input
								type="file"
								accept={{ACCEPT}}
								multiple
								class="dt-sr-only"
								{{on
									"change"
									this.handleFileSelect
								}}
							/>
							<Icon
								@name="file-plus"
							/>
							Add PDFs
						</label>
						<button
							type="button"
							class="dt-porg-btn"
							{{on
								"click"
								this.clearAll
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-porg-btn is-primary"
							disabled={{or
								this.busy
								(not
									this.pages.length
								)
							}}
							{{on
								"click"
								this.downloadMerged
							}}
						>
							<Icon
								@name="download"
							/>
							Download merged PDF
						</button>
					</div>

					<div class="dt-porg-settings">
						<div class="dt-porg-field">
							<span>Split</span>
							<div
								class="segmented dt-porg-splitmode"
							>
								<button
									type="button"
									class="dt-porg-opt
										{{if
											(eq
												this.splitMode
												'ranges'
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setSplitMode
											"ranges"
										)
									}}
								>By ranges</button>
								<button
									type="button"
									class="dt-porg-opt
										{{if
											(eq
												this.splitMode
												'pages'
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setSplitMode
											"pages"
										)
									}}
								>Every page</button>
							</div>
						</div>

						{{#if
							(eq
								this.splitMode
								"ranges"
							)
						}}
							<label
								class="dt-porg-field"
							>
								<span
								>Ranges</span>
								<input
									type="text"
									placeholder="1-3, 7-9"
									value={{this.rangeSpec}}
									{{on
										"input"
										this.setRangeSpec
									}}
								/>
							</label>
						{{/if}}

						<button
							type="button"
							class="dt-porg-splitgo"
							disabled={{not
								this.canSplit
							}}
							{{on
								"click"
								this.downloadSplit
							}}
						>
							<Icon
								@name="scissors"
							/>
							{{this.splitLabel}}
						</button>
					</div>

					{{#if this.parsedRanges.error}}
						<p class="dt-porg-error">Ranges:
							{{this.parsedRanges.error}}</p>
					{{/if}}
					{{#if this.error}}
						<p
							class="dt-porg-error"
						>{{this.error}}</p>
					{{/if}}

					<ol class="dt-porg-grid">
						{{#each
							this.pages key="id"
							as |entry|
						}}
							<li
								class="dt-porg-cell
									{{if
										(eq
											this.dragOverId
											entry.id
										)
										'is-drag-over'
									}}"
								draggable="true"
								{{on
									"dragstart"
									(fn
										this.dragStart
										entry.id
									)
								}}
								{{on
									"dragover"
									(fn
										this.dragOver
										entry.id
									)
								}}
								{{on
									"drop"
									(fn
										this.dropOnCell
										entry.id
									)
								}}
								{{on
									"dragend"
									this.dragEnd
								}}
							>
								{{#if
									entry.thumb
								}}
									<img
										class="dt-porg-thumb
											{{this.rotationClass
												entry
											}}"
										src={{entry.thumb}}
										alt={{this.pageLabel
											entry
										}}
									/>
								{{else}}
									<div
										class="dt-porg-thumb-fallback"
									>
										<Icon
											@name="file-stack"
										/>
									</div>
								{{/if}}
								<div
									class="dt-porg-cell-foot"
								>
									<span
										class="dt-porg-badge"
										title={{this.sourceName
											entry
										}}
									>{{this.pageLabel
											entry
										}}</span>
									<span
										class="dt-porg-cell-tools"
									>
										<button
											type="button"
											class="dt-porg-tool"
											title="Rotate"
											{{on
												"click"
												(fn
													this.rotatePage
													entry
												)
											}}
										>
											<Icon
												@name="rotate-cw"
											/>
										</button>
										<button
											type="button"
											class="dt-porg-tool"
											title="Delete"
											{{on
												"click"
												(fn
													this.deletePage
													entry
												)
											}}
										>
											<Icon
												@name="x"
											/>
										</button>
									</span>
								</div>
							</li>
						{{/each}}
					</ol>
				{{/if}}
			</div>
		</div>
	</template>
}
