import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn, hash, get } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq, not } from 'ember-truth-helpers';
import type { DragEndEvent } from '@dnd-kit/dom';
import Icon from 'delphitools-v2/components/icon';
import Dialog from 'delphitools-v2/components/ui/dialog';
import sortable from 'delphitools-v2/modifiers/sortable';
import { createDndManager } from 'delphitools-v2/lib/dnd';
import { downloadBlob, downloadText } from 'delphitools-v2/lib/download';
import { layout, type Cell } from 'delphitools-v2/lib/recipe-table';
import {
	addDiscard,
	addIng,
	addOp,
	addPrep,
	addRef,
	addSection,
	editDiscard,
	editIng,
	editOp,
	editPrep,
	editRef,
	emptyDoc,
	factorFor,
	moveInput,
	moveInputTo,
	moveOp,
	moveOpTo,
	movePrep,
	moveSection,
	moveSectionTo,
	present,
	removeDiscard,
	removeInput,
	removeOp,
	removePrep,
	removeSection,
	renameSection,
	setMeta,
	targets,
	toTree,
	validate,
	type Doc,
	type Id,
} from 'delphitools-v2/lib/recipe-doc';
import {
	parse,
	serialize,
	type Diagnostic,
} from 'delphitools-v2/lib/recipe-dsl';
import type { Display } from 'delphitools-v2/lib/recipe-scale';
import { toHtml, toPdf, toText } from 'delphitools-v2/lib/recipe-export';

const SAMPLE = `title: Aglio e olio
serves: 2
units: metric

> Salt a large pot of water

## sauce
fry | 2 min
- 2 Tbsp olive oil
- 2 cloves garlic | slice
- pinch chilli flakes

## pasta
boil | 9 min
- 200 g spaghetti
- salted water
drain = pasta water
x most of the water
toss (sauce) | 1 min
loosen (pasta water: ¼ cup)
serve
- 30 g grated parmesan
- parsley | chop`;

const STORAGE_KEY = 'dt-recipe-table';
const DISPLAYS: Display[] = ['written', 'metric', 'imperial'];
const DISPLAY_LABEL: Record<Display, string> = {
	written: 'Written',
	metric: 'Metric',
	imperial: 'Imperial',
};

interface Stored {
	version: 1;
	doc: Doc;
}

function load(): Doc {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return parse(SAMPLE).doc;
		const stored = JSON.parse(raw) as Partial<Stored>;
		if (stored.version === 1 && stored.doc) return stored.doc;
	} catch {
		/* legacy DSL text or private mode */
	}
	const legacy = localStorage.getItem(STORAGE_KEY);
	return parse(legacy ?? SAMPLE).doc;
}

function save(doc: Doc) {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ version: 1, doc }),
		);
	} catch {
		/* private mode */
	}
}

const area = (cell: Cell) =>
	htmlSafe(
		`grid-area: ${cell.row + 1} / ${cell.col + 1} / span ${cell.rows} / span ${cell.cols}`,
	);
const columns = (cols: number) =>
	htmlSafe(
		`grid-template-columns: max-content repeat(${Math.max(0, cols - 1)}, minmax(4rem, 1fr))`,
	);
const displayLabel = (display: Display) => DISPLAY_LABEL[display];
const joined = (parts: string[]) => parts.join(' | ');
const slug = (title: string) =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'recipe';
const value = (event: Event) => (event.target as HTMLInputElement).value;

interface Place {
	kind: string;
	container: Id;
	index: number;
}

const CONTAINER: Record<string, [string, string]> = {
	input: ['[data-op]', ':scope > .dt-rt-row.is-input'],
	op: ['[data-section]', ':scope > .dt-rt-op'],
};

// where the dragged element sits in the DOM after the drop
function landing(kind: string, el: HTMLElement): Place | null {
	if (kind === 'section') {
		const parent = el.parentElement;
		if (!parent) return null;
		return {
			kind,
			container: 'doc',
			index: Array.from(
				parent.querySelectorAll(
					':scope > .dt-rt-section',
				),
			).indexOf(el),
		};
	}
	const [ancestor, siblings] = CONTAINER[kind] ?? ['', ''];
	const parent = el.closest<HTMLElement>(ancestor);
	const container = parent?.dataset.op ?? parent?.dataset.section;
	if (!parent || !container) return null;
	return {
		kind,
		container,
		index: Array.from(parent.querySelectorAll(siblings)).indexOf(
			el,
		),
	};
}

export default class RecipeTableTool extends Component {
	@tracked doc: Doc = load();
	@tracked amountRaw: string | null = null;
	@tracked display: Display = 'written';
	@tracked done = new Set<Id>();
	@tracked copied = false;
	@tracked dsl = '';
	@tracked dslErrors: Diagnostic[] = [];

	manager = createDndManager();
	#copiedTimer?: ReturnType<typeof setTimeout>;

	constructor(...args: ConstructorParameters<typeof Component>) {
		super(...args);
		this.manager.monitor.addEventListener(
			'dragend',
			this.onDragEnd,
		);
	}

	willDestroy() {
		super.willDestroy();
		this.manager.destroy();
		clearTimeout(this.#copiedTimer);
	}

	get baseline() {
		return this.doc.serves;
	}

	get amount(): number {
		const fallback = this.baseline ?? 1;
		if (this.amountRaw === null) return fallback;
		const n = Number.parseFloat(this.amountRaw);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	}

	get amountText() {
		return this.amountRaw ?? String(this.baseline ?? 1);
	}

	get factor() {
		return factorFor(this.doc, this.amount);
	}

	get scaled() {
		return this.factor !== 1 || this.display !== 'written';
	}

	get presented(): Doc {
		return this.scaled
			? present(
					this.doc,
					this.factor,
					this.display,
					this.amount,
				)
			: this.doc;
	}

	get grid() {
		return layout(toTree(this.presented));
	}

	get preps() {
		return this.presented.preps
			.map((p) => p.text.trim())
			.filter(Boolean);
	}

	get meta() {
		return { title: this.doc.title, preps: this.preps };
	}

	get problems(): Record<Id, string> {
		const out: Record<Id, string> = {};
		for (const p of validate(this.doc)) out[p.id] ??= p.message;
		return out;
	}

	get displays() {
		return DISPLAYS;
	}

	get sections() {
		const { doc } = this;
		return doc.sections.map((section, index) => ({
			section,
			index,
			ops: section.ops.map((op, opIndex) => ({
				op,
				index: opIndex,
				targets: targets(doc, op.id),
				inputs: op.inputs.map((input, inputIndex) => ({
					input,
					index: inputIndex,
				})),
				discards: op.discard.map(
					(text, discardIndex) => ({
						text,
						index: discardIndex,
					}),
				),
			})),
		}));
	}

	isDone = (id: Id) => this.done.has(id);

	#commit(doc: Doc) {
		const before = this.doc.serves;
		this.doc = doc;
		if (doc.serves !== before) this.amountRaw = null;
		save(doc);
	}

	// header block
	setTitle = (event: Event) =>
		this.#commit(setMeta(this.doc, { title: value(event) }));
	setServes = (event: Event) => {
		const n = Number.parseFloat(value(event));
		this.#commit(
			setMeta(this.doc, {
				serves: Number.isFinite(n) && n > 0 ? n : null,
			}),
		);
	};
	setUnits = (event: Event) => {
		const v = value(event);
		this.#commit(
			setMeta(this.doc, {
				units:
					v === 'metric' || v === 'imperial'
						? v
						: null,
			}),
		);
	};
	addPrep = () => this.#commit(addPrep(this.doc));
	editPrep = (id: Id, event: Event) =>
		this.#commit(editPrep(this.doc, id, value(event)));
	removePrep = (id: Id) => this.#commit(removePrep(this.doc, id));
	movePrep = (id: Id, delta: number) =>
		this.#commit(movePrep(this.doc, id, delta));

	// sections
	addSection = () => this.#commit(addSection(this.doc));
	renameSection = (id: Id, event: Event) =>
		this.#commit(renameSection(this.doc, id, value(event)));
	removeSection = (id: Id) => this.#commit(removeSection(this.doc, id));
	moveSection = (id: Id, delta: number) =>
		this.#commit(moveSection(this.doc, id, delta));

	// operations
	addOp = (sectionId: Id) => this.#commit(addOp(this.doc, sectionId));
	editLabel = (id: Id, event: Event) =>
		this.#commit(editOp(this.doc, id, { label: value(event) }));
	editDetail = (id: Id, event: Event) =>
		this.#commit(
			editOp(this.doc, id, {
				detail: value(event)
					.split('|')
					.map((s) => s.trim())
					.filter(Boolean),
			}),
		);
	editResult = (id: Id, event: Event) =>
		this.#commit(editOp(this.doc, id, { result: value(event) }));
	removeOp = (id: Id) => this.#commit(removeOp(this.doc, id));
	moveOp = (id: Id, delta: number) =>
		this.#commit(moveOp(this.doc, id, delta));

	// inputs
	addIng = (opId: Id) => this.#commit(addIng(this.doc, opId));
	addRef = (opId: Id) => {
		const first = targets(this.doc, opId)[0];
		if (first) this.#commit(addRef(this.doc, opId, first.id));
	};
	editIngText = (id: Id, event: Event) =>
		this.#commit(editIng(this.doc, id, { text: value(event) }));
	editIngPrep = (id: Id, event: Event) =>
		this.#commit(editIng(this.doc, id, { prep: value(event) }));
	setRefTarget = (id: Id, event: Event) =>
		this.#commit(editRef(this.doc, id, { target: value(event) }));
	editRefNote = (id: Id, event: Event) =>
		this.#commit(editRef(this.doc, id, { note: value(event) }));
	removeInput = (id: Id) => this.#commit(removeInput(this.doc, id));
	moveInput = (id: Id, delta: number) =>
		this.#commit(moveInput(this.doc, id, delta));
	addDiscard = (opId: Id) => this.#commit(addDiscard(this.doc, opId));
	editDiscard = (opId: Id, index: number, event: Event) =>
		this.#commit(editDiscard(this.doc, opId, index, value(event)));
	removeDiscard = (opId: Id, index: number) =>
		this.#commit(removeDiscard(this.doc, opId, index));

	// dnd-kit may have moved the element already; otherwise the drop target says where
	onDragEnd = (event: DragEndEvent) => {
		if (event.canceled) return;
		const { source, target } = event.operation;
		const from = source?.data as Place | undefined;
		const el = source?.element as HTMLElement | null | undefined;
		if (!source || !from || !el) return;
		const id = String(source.id);
		const landed = landing(from.kind, el);
		const to = target?.data as Place | undefined;
		let dest: { container: Id; index: number } | null = null;
		if (
			landed &&
			(landed.container !== from.container ||
				landed.index !== from.index)
		)
			dest = landed;
		else if (
			to &&
			to.kind === from.kind &&
			to.container !== from.container
		)
			dest = { container: to.container, index: to.index };
		if (!dest) return;
		if (from.kind === 'input')
			this.#commit(
				moveInputTo(
					this.doc,
					id,
					dest.container,
					dest.index,
				),
			);
		else if (from.kind === 'op')
			this.#commit(
				moveOpTo(
					this.doc,
					id,
					dest.container,
					dest.index,
				),
			);
		else this.#commit(moveSectionTo(this.doc, id, dest.index));
	};

	// scale and units
	setAmount = (event: Event) => {
		this.amountRaw = value(event);
	};
	step = (delta: number) => {
		const min = this.baseline ? 1 : 0.25;
		this.amountRaw = String(Math.max(min, this.amount + delta));
	};
	setDisplay = (display: Display) => {
		this.display = display;
	};
	applyScale = () => {
		this.#commit(
			present(
				this.doc,
				this.factor,
				this.display,
				this.amount,
			),
		);
		this.amountRaw = null;
		this.display = 'written';
	};

	toggleDone = (id: Id) => {
		const next = new Set(this.done);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.done = next;
	};

	// document actions
	reset = () => {
		if (!confirm('Discard recipe?')) return;
		this.#commit(emptyDoc());
		this.done = new Set();
	};
	copyHtml = async () => {
		const html = toHtml(this.meta, this.grid);
		const text = toText(this.meta, this.grid);
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					'text/html': new Blob([html], {
						type: 'text/html',
					}),
					'text/plain': new Blob([text], {
						type: 'text/plain',
					}),
				}),
			]);
		} catch {
			await navigator.clipboard.writeText(text);
		}
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			1500,
		);
	};
	downloadPdf = async () => {
		const bytes = await toPdf(this.meta, this.grid);
		downloadBlob(
			new Blob([new Uint8Array(bytes)], {
				type: 'application/pdf',
			}),
			`${slug(this.doc.title)}.pdf`,
		);
	};

	// recipe text dialog
	openDsl = (open: () => void) => {
		this.dsl = serialize(this.doc);
		this.dslErrors = [];
		open();
	};
	setDsl = (event: Event) => {
		this.dsl = (event.target as HTMLTextAreaElement).value;
	};
	importDsl = (close: () => void) => {
		const { doc, errors } = parse(this.dsl);
		this.dslErrors = errors;
		if (errors.length) return;
		this.#commit(doc);
		this.done = new Set();
		close();
	};
	copyDsl = () => navigator.clipboard.writeText(this.dsl);
	downloadDsl = () =>
		downloadText(this.dsl, `${slug(this.doc.title)}.recipe.txt`);

	<template>
		<div class="dt-rt">
			<div class="dt-rt-bar">
				<div class="dt-rt-scale">
					<span
						class="dt-rt-scale-label"
						id="dt-rt-scale-label"
					>{{if
							this.baseline
							"Scale to"
							"Multiply by"
						}}</span>
					<button
						type="button"
						class="dt-rt-step"
						aria-label="Less"
						{{on "click" (fn this.step -1)}}
					>
						<Icon @name="minus" />
					</button>
					<input
						type="number"
						class="dt-rt-amount"
						aria-labelledby="dt-rt-scale-label"
						min="0.25"
						step="any"
						value={{this.amountText}}
						{{on "input" this.setAmount}}
					/>
					<button
						type="button"
						class="dt-rt-step"
						aria-label="More"
						{{on "click" (fn this.step 1)}}
					>
						<Icon @name="plus" />
					</button>
				</div>

				<div
					class="segmented dt-rt-units"
					role="group"
					aria-label="Units"
				>
					{{#each this.displays as |display|}}
						<button
							type="button"
							class="dt-rt-unit
								{{if
									(eq
										this.display
										display
									)
									'is-active'
								}}"
							aria-pressed={{if
								(eq
									this.display
									display
								)
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.setDisplay
									display
								)
							}}
						>{{displayLabel
								display
							}}</button>
					{{/each}}
				</div>

				<button
					type="button"
					class="dt-rt-btn"
					disabled={{not this.scaled}}
					{{on "click" this.applyScale}}
				>
					<Icon @name="check" />
					<span>Apply</span>
				</button>

				<span class="dt-rt-spacer"></span>

				<Dialog as |d|>
					<button
						type="button"
						class="dt-rt-btn"
						{{d.focusOnClose}}
						{{on
							"click"
							(fn this.openDsl d.open)
						}}
					>
						<Icon @name="file-text" />
						<span>Recipe text</span>
					</button>
					<d.Content
						class="dt-dialog dt-rt-dialog"
					>
						<header class="dt-dialog-head">
							<h2>Recipe text</h2>
							<button
								type="button"
								class="dt-dialog-close"
								aria-label="Close"
								{{on
									"click"
									d.close
								}}
							>
								<Icon
									@name="x"
								/>
							</button>
						</header>
						<textarea
							class="dt-rt-dsl"
							aria-label="Recipe text"
							spellcheck="false"
							value={{this.dsl}}
							{{on
								"input"
								this.setDsl
							}}
						></textarea>
						{{#if this.dslErrors.length}}
							<ul
								class="dt-rt-dsl-errors"
								role="status"
							>
								{{#each
									this.dslErrors
									as |error|
								}}
									<li>line
										{{error.line}}:
										{{error.message}}</li>
								{{/each}}
							</ul>
						{{/if}}
						<div
							class="segmented dt-rt-dsl-actions"
						>
							<button
								type="button"
								class="dt-rt-dsl-btn"
								{{on
									"click"
									this.copyDsl
								}}
							>
								<Icon
									@name="copy"
								/>
								<span
								>Copy</span>
							</button>
							<button
								type="button"
								class="dt-rt-dsl-btn"
								{{on
									"click"
									this.downloadDsl
								}}
							>
								<Icon
									@name="download"
								/>
								<span
								>Download</span>
							</button>
							<button
								type="button"
								class="dt-rt-dsl-btn is-primary"
								{{on
									"click"
									(fn
										this.importDsl
										d.close
									)
								}}
							>
								<Icon
									@name="check"
								/>
								<span
								>Import</span>
							</button>
						</div>
					</d.Content>
				</Dialog>

				<button
					type="button"
					class="dt-rt-btn"
					{{on "click" this.reset}}
				>
					<Icon @name="file-plus" />
					<span>New</span>
				</button>
				<button
					type="button"
					class="dt-rt-btn"
					{{on "click" this.copyHtml}}
				>
					<Icon
						@name={{if
							this.copied
							"check"
							"copy"
						}}
					/>
					<span>{{if
							this.copied
							"Copied"
							"Copy HTML"
						}}</span>
				</button>
				<button
					type="button"
					class="dt-rt-btn is-primary"
					{{on "click" this.downloadPdf}}
				>
					<Icon @name="download" />
					<span>Download PDF</span>
				</button>
			</div>

			<div class="dt-rt-body">
				<div class="dt-rt-editor">
					<div class="dt-rt-head">
						<label class="dt-rt-field">
							<span
								class="dt-rt-field-label"
							>Title</span>
							<input
								type="text"
								class="dt-rt-input"
								value={{this.doc.title}}
								{{on
									"input"
									this.setTitle
								}}
							/>
						</label>
						<div class="dt-rt-field-row">
							<label
								class="dt-rt-field"
							>
								<span
									class="dt-rt-field-label"
								>Serves</span>
								<input
									type="number"
									class="dt-rt-input"
									min="1"
									step="any"
									value={{this.doc.serves}}
									{{on
										"input"
										this.setServes
									}}
								/>
							</label>
							<label
								class="dt-rt-field"
							>
								<span
									class="dt-rt-field-label"
								>Units</span>
								<select
									class="dt-rt-select"
									{{on
										"change"
										this.setUnits
									}}
								>
									<option
										value=""
										selected={{not
											this.doc.units
										}}
									>Unset</option>
									<option
										value="metric"
										selected={{eq
											this.doc.units
											"metric"
										}}
									>Metric</option>
									<option
										value="imperial"
										selected={{eq
											this.doc.units
											"imperial"
										}}
									>Imperial</option>
								</select>
							</label>
						</div>
						{{#each
							this.doc.preps key="id"
							as |prep index|
						}}
							<div
								class="dt-rt-row is-prep"
							>
								<span
									class="dt-rt-kind"
									aria-hidden="true"
								><Icon
										@name="list-checks"
									/></span>
								<input
									type="text"
									class="dt-rt-input"
									aria-label="Prep step {{index}}"
									placeholder="Prep step"
									value={{prep.text}}
									{{on
										"input"
										(fn
											this.editPrep
											prep.id
										)
									}}
								/>
								<button
									type="button"
									class="dt-rt-icon-btn"
									aria-label="Move up"
									{{on
										"click"
										(fn
											this.movePrep
											prep.id
											-1
										)
									}}
								><Icon
										@name="chevron-up"
									/></button>
								<button
									type="button"
									class="dt-rt-icon-btn"
									aria-label="Move down"
									{{on
										"click"
										(fn
											this.movePrep
											prep.id
											1
										)
									}}
								><Icon
										@name="chevron-down"
									/></button>
								<button
									type="button"
									class="dt-rt-icon-btn"
									aria-label="Remove prep step"
									{{on
										"click"
										(fn
											this.removePrep
											prep.id
										)
									}}
								><Icon
										@name="x"
									/></button>
							</div>
						{{/each}}
						<button
							type="button"
							class="dt-rt-add"
							{{on
								"click"
								this.addPrep
							}}
						>
							<Icon @name="plus" />
							<span>Prep step</span>
						</button>
					</div>

					{{#each
						this.sections key="section.id"
						as |row|
					}}
						<section
							class="dt-rt-section"
							data-section={{row.section.id}}
							aria-label={{if
								row.section.name
								row.section.name
								"Section"
							}}
							{{sortable
								id=row.section.id
								index=row.index
								group="section"
								type="section"
								accept="section"
								handle=".dt-rt-grip"
								manager=this.manager
								data=(hash
									kind="section"
									container="doc"
									index=row.index
								)
							}}
						>
							<div
								class="dt-rt-row is-section"
							>
								<button
									type="button"
									class="dt-rt-grip"
									aria-label="Drag section"
								><Icon
										@name="grip-vertical"
									/></button>
								<input
									type="text"
									class="dt-rt-input is-section"
									aria-label="Section name"
									placeholder="Section"
									value={{row.section.name}}
									{{on
										"input"
										(fn
											this.renameSection
											row.section.id
										)
									}}
								/>
								<button
									type="button"
									class="dt-rt-icon-btn is-move"
									aria-label="Move section up"
									{{on
										"click"
										(fn
											this.moveSection
											row.section.id
											-1
										)
									}}
								><Icon
										@name="chevron-up"
									/></button>
								<button
									type="button"
									class="dt-rt-icon-btn is-move"
									aria-label="Move section down"
									{{on
										"click"
										(fn
											this.moveSection
											row.section.id
											1
										)
									}}
								><Icon
										@name="chevron-down"
									/></button>
								<button
									type="button"
									class="dt-rt-icon-btn"
									aria-label="Remove section"
									{{on
										"click"
										(fn
											this.removeSection
											row.section.id
										)
									}}
								><Icon
										@name="x"
									/></button>
							</div>
							{{#if
								(get
									this.problems
									row.section.id
								)
							}}
								<p
									class="dt-rt-problem"
								>{{get
										this.problems
										row.section.id
									}}</p>
							{{/if}}

							{{#each
								row.ops
								key="op.id"
								as |item|
							}}
								<div
									class="dt-rt-op"
									data-op={{item.op.id}}
									{{sortable
										id=item.op.id
										index=item.index
										group="op"
										type="op"
										accept="op"
										handle=".dt-rt-grip"
										manager=this.manager
										data=(hash
											kind="op"
											container=row.section.id
											index=item.index
										)
									}}
								>
									<div
										class="dt-rt-row is-op"
									>
										<button
											type="button"
											class="dt-rt-grip"
											aria-label="Drag operation"
										><Icon
												@name="grip-vertical"
											/></button>
										<input
											type="text"
											class="dt-rt-input is-label"
											aria-label="Operation"
											placeholder="Operation"
											value={{item.op.label}}
											{{on
												"input"
												(fn
													this.editLabel
													item.op.id
												)
											}}
										/>
										<input
											type="text"
											class="dt-rt-input is-detail"
											aria-label="Detail"
											placeholder="Detail"
											value={{joined
												item.op.detail
											}}
											{{on
												"input"
												(fn
													this.editDetail
													item.op.id
												)
											}}
										/>
										<input
											type="text"
											class="dt-rt-input is-result"
											aria-label="Result name"
											placeholder="Name"
											value={{item.op.result}}
											{{on
												"input"
												(fn
													this.editResult
													item.op.id
												)
											}}
										/>
										<button
											type="button"
											class="dt-rt-icon-btn is-move"
											aria-label="Move operation up"
											{{on
												"click"
												(fn
													this.moveOp
													item.op.id
													-1
												)
											}}
										><Icon
												@name="chevron-up"
											/></button>
										<button
											type="button"
											class="dt-rt-icon-btn is-move"
											aria-label="Move operation down"
											{{on
												"click"
												(fn
													this.moveOp
													item.op.id
													1
												)
											}}
										><Icon
												@name="chevron-down"
											/></button>
										<button
											type="button"
											class="dt-rt-icon-btn"
											aria-label="Remove operation"
											{{on
												"click"
												(fn
													this.removeOp
													item.op.id
												)
											}}
										><Icon
												@name="x"
											/></button>
									</div>
									{{#if
										(get
											this.problems
											item.op.id
										)
									}}
										<p
											class="dt-rt-problem"
										>{{get
												this.problems
												item.op.id
											}}</p>
									{{/if}}

									{{#each
										item.inputs
										key="input.id"
										as |entry|
									}}
										<div
											class="dt-rt-row is-input"
											{{sortable
												id=entry.input.id
												index=entry.index
												group="input"
												type="input"
												accept="input"
												handle=".dt-rt-grip"
												manager=this.manager
												data=(hash
													kind="input"
													container=item.op.id
													index=entry.index
												)
											}}
										>
											<button
												type="button"
												class="dt-rt-grip"
												aria-label="Drag ingredient"
											><Icon
													@name="grip-vertical"
												/></button>
											{{#if
												(eq
													entry.input.kind
													"ing"
												)
											}}
												<span
													class="dt-rt-kind"
													aria-hidden="true"
												><Icon
														@name="carrot"
													/></span>
												<input
													type="text"
													class="dt-rt-input"
													aria-label="Ingredient"
													placeholder="Ingredient"
													value={{entry.input.text}}
													{{on
														"input"
														(fn
															this.editIngText
															entry.input.id
														)
													}}
												/>
												<input
													type="text"
													class="dt-rt-input is-prep"
													aria-label="Prep"
													placeholder="Prep"
													value={{entry.input.prep}}
													{{on
														"input"
														(fn
															this.editIngPrep
															entry.input.id
														)
													}}
												/>
											{{else}}
												<span
													class="dt-rt-kind"
													aria-hidden="true"
												><Icon
														@name="link"
													/></span>
												<select
													class="dt-rt-select"
													aria-label="Reference"
													{{on
														"change"
														(fn
															this.setRefTarget
															entry.input.id
														)
													}}
												>
													{{#each
														item.targets
														as |target|
													}}
														<option
															value={{target.id}}
															selected={{eq
																target.id
																entry.input.target
															}}
														>{{target.label}}</option>
													{{/each}}
												</select>
												<input
													type="text"
													class="dt-rt-input is-prep"
													aria-label="Amount used"
													placeholder="Amount"
													value={{entry.input.note}}
													{{on
														"input"
														(fn
															this.editRefNote
															entry.input.id
														)
													}}
												/>
											{{/if}}
											<button
												type="button"
												class="dt-rt-icon-btn is-move"
												aria-label="Move up"
												{{on
													"click"
													(fn
														this.moveInput
														entry.input.id
														-1
													)
												}}
											><Icon
													@name="chevron-up"
												/></button>
											<button
												type="button"
												class="dt-rt-icon-btn is-move"
												aria-label="Move down"
												{{on
													"click"
													(fn
														this.moveInput
														entry.input.id
														1
													)
												}}
											><Icon
													@name="chevron-down"
												/></button>
											<button
												type="button"
												class="dt-rt-icon-btn"
												aria-label="Remove"
												{{on
													"click"
													(fn
														this.removeInput
														entry.input.id
													)
												}}
											><Icon
													@name="x"
												/></button>
										</div>
										{{#if
											(get
												this.problems
												entry.input.id
											)
										}}
											<p
												class="dt-rt-problem"
											>{{get
													this.problems
													entry.input.id
												}}</p>
										{{/if}}
									{{/each}}

									{{#each
										item.discards
										as |discard|
									}}
										<div
											class="dt-rt-row is-discard"
										>
											<span
												class="dt-rt-kind"
												aria-hidden="true"
											><Icon
													@name="trash-2"
												/></span>
											<input
												type="text"
												class="dt-rt-input is-struck"
												aria-label="Discarded output"
												placeholder="Discard"
												value={{discard.text}}
												{{on
													"input"
													(fn
														this.editDiscard
														item.op.id
														discard.index
													)
												}}
											/>
											<button
												type="button"
												class="dt-rt-icon-btn"
												aria-label="Remove discard"
												{{on
													"click"
													(fn
														this.removeDiscard
														item.op.id
														discard.index
													)
												}}
											><Icon
													@name="x"
												/></button>
										</div>
									{{/each}}

									<div
										class="segmented dt-rt-op-foot"
									>
										<button
											type="button"
											class="dt-rt-add"
											{{on
												"click"
												(fn
													this.addIng
													item.op.id
												)
											}}
										>
											<Icon
												@name="plus"
											/>
											<span
											>Ingredient</span>
										</button>
										<button
											type="button"
											class="dt-rt-add"
											disabled={{not
												item.targets.length
											}}
											{{on
												"click"
												(fn
													this.addRef
													item.op.id
												)
											}}
										>
											<Icon
												@name="link"
											/>
											<span
											>Reference</span>
										</button>
										<button
											type="button"
											class="dt-rt-add"
											{{on
												"click"
												(fn
													this.addDiscard
													item.op.id
												)
											}}
										>
											<Icon
												@name="trash-2"
											/>
											<span
											>Discard</span>
										</button>
									</div>
								</div>
							{{/each}}

							<button
								type="button"
								class="dt-rt-add is-op"
								{{on
									"click"
									(fn
										this.addOp
										row.section.id
									)
								}}
							>
								<Icon
									@name="plus"
								/>
								<span
								>Operation</span>
							</button>
						</section>
					{{/each}}

					<button
						type="button"
						class="dt-rt-add is-section"
						{{on "click" this.addSection}}
					>
						<Icon @name="plus" />
						<span>Section</span>
					</button>
				</div>

				<div class="dt-rt-preview">
					{{#if this.doc.title}}
						<h2
							class="dt-rt-title"
						>{{this.doc.title}}</h2>
					{{/if}}
					{{#if this.preps.length}}
						<ol class="dt-rt-preps">
							{{#each
								this.preps
								as |prep|
							}}
								<li
								>{{prep}}</li>
							{{/each}}
						</ol>
					{{/if}}
					{{#if this.grid.rows}}
						<div
							class="dt-rt-grid"
							style={{columns
								this.grid.cols
							}}
						>
							{{#each
								this.grid.cells
								as |cell|
							}}
								{{#if
									(eq
										cell.kind
										"op"
									)
								}}
									<button
										type="button"
										class="dt-rt-cell is-op
											{{if
												cell.vertical
												'is-vertical'
											}}
											{{if
												(this.isDone
													cell.opId
												)
												'is-done'
											}}"
										style={{area
											cell
										}}
										aria-pressed={{if
											(this.isDone
												cell.opId
											)
											"true"
											"false"
										}}
										{{on
											"click"
											(fn
												this.toggleDone
												cell.opId
											)
										}}
									>
										<span
											class="dt-rt-label"
										>{{cell.text}}</span>
										{{#each
											cell.notes
											as |line|
										}}
											<span
												class="dt-rt-note"
											>{{line}}</span>
										{{/each}}
										{{#each
											cell.discard
											as |line|
										}}
											<span
												class="dt-rt-discard"
											><span
													aria-hidden="true"
												>✕
												</span><span
													class="dt-sr-only"
												>discard
												</span>{{line}}</span>
										{{/each}}
										{{#if
											cell.tag
										}}
											<span
												class="dt-rt-tag"
											>{{cell.tag}}</span>
										{{/if}}
									</button>
								{{else}}
									<div
										class="dt-rt-cell is-{{cell.kind}}"
										style={{area
											cell
										}}
									>
										{{#if
											(eq
												cell.kind
												"ref"
											)
										}}
											<span
												class="dt-rt-label"
											><span
													aria-hidden="true"
												>↩
												</span><span
													class="dt-sr-only"
												>from
												</span>{{cell.text}}</span>
										{{else if
											cell.text
										}}
											<span
												class="dt-rt-label"
											>{{cell.text}}</span>
										{{/if}}
										{{#each
											cell.notes
											as |line|
										}}
											<span
												class="dt-rt-note"
											>{{line}}</span>
										{{/each}}
									</div>
								{{/if}}
							{{/each}}
						</div>
					{{/if}}
				</div>
			</div>
		</div>
	</template>
}
