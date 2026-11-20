import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonStepper from 'delphicanon/components/canon-stepper';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { parse } from 'delphitools-v2/lib/recipe-parse';
import { EXAMPLES } from 'delphitools-v2/lib/recipe-examples';
import { render, type Cell } from 'delphitools-v2/lib/recipe-layout';
import { parseNumber, type Display } from 'delphitools-v2/lib/recipe-scale';
import { toHtml, toPrintable, toText } from 'delphitools-v2/lib/recipe-export';
import MarkedEditor from 'delphitools-v2/components/tools/media/marked-editor';
import Picture from 'delphitools-v2/components/tools/recipe-table/picture';
import { syntaxLines } from 'delphitools-v2/components/tools/recipe-table/syntax';
import './recipe-table/recipe-table.css';

const SAMPLE = `title: Aglio e olio
serves: 2
units: metric

> Salt a large pot of water

fry | 2 min
- olive oil: 2 Tbsp
- garlic: 2 cloves / slice
- chilli flakes: 1 pinch
= sauce

boil | 9 min
- spaghetti: 200 g
- water: salted
drain
x most of the water
= pasta water
toss | 1 min
@ sauce
loosen
@ pasta water | ¼ cup
serve
- parmesan: 30 g | grated
- parsley: 1 handful / chop
- olive oil: 1 Tbsp`;

const PLACEHOLDER = 'Write a recipe as a Cooking for Engineers table';
const ABOUT =
	'The Recipe Table tool lets you write out recipes for cooking (or other things) and outputs them in a nice to read Cooking-For-Engineers style action table. The format is a plain text domain-specific-language called ClaraScript, named after my grandmother.';
const STORAGE_KEY = 'dt-recipe-text';
const DISPLAYS: Display[] = ['written', 'metric', 'imperial'];
const DISPLAY_LABELS = ['Written', 'Metric', 'Imperial'];

const NewIcon = <template><IconSvg @name="file-plus" /></template>;
const CopyIcon = <template><IconSvg @name="copy" /></template>;
const AlertIcon = <template><IconSvg @name="triangle-alert" /></template>;
const PrintIcon = <template><IconSvg @name="printer" /></template>;

function load(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
	} catch {
		return SAMPLE;
	}
}

function save(text: string) {
	try {
		localStorage.setItem(STORAGE_KEY, text);
	} catch {
		// private mode: visit only
	}
}

export default class RecipeTableTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked text: string;
	@tracked amountRaw: string | null = null;
	@tracked display: Display = 'written';
	@tracked done: ReadonlySet<string> = new Set();
	@tracked copyFailed = false;
	@tracked pictureHeight?: number;
	#failedTimer?: ReturnType<typeof setTimeout>;
	#persists = true;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const sample = EXAMPLES.find(
			(e) => e.id === query.get('rtSample'),
		);
		const given = query.get('rtText') ?? sample?.text;
		this.#persists = given === undefined;
		this.text = given ?? load();
		const units = DISPLAYS.indexOf(query.get('rtUnits') as Display);
		if (units > 0) this.display = DISPLAYS[units]!;
		this.amountRaw = query.get('rtScale');
	}

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#failedTimer);
	}

	@cached
	get recipe() {
		return parse(this.text);
	}

	@cached
	get lines() {
		const flagged = new Set(
			this.recipe.problems.map((p) => p.line),
		);
		return syntaxLines(this.text).map((runs, index) => ({
			runs: runs.length ? runs : [{ text: ' ', kind: null }],
			lit: flagged.has(index + 1),
		}));
	}

	get baseline() {
		return this.recipe.serves;
	}

	get amount(): number {
		const fallback = this.baseline ?? 1;
		if (this.amountRaw === null) return fallback;
		const n = parseNumber(this.amountRaw);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	}

	get amountText() {
		return this.amountRaw ?? String(this.baseline ?? 1);
	}

	get scaleTitle() {
		return this.baseline ? 'Scale to' : 'Multiply by';
	}

	get factor() {
		const { serves } = this.recipe;
		return serves ? this.amount / serves : this.amount;
	}

	@cached
	get rendered() {
		return render(this.recipe, {
			factor: this.factor,
			display: this.display,
		});
	}

	get blank() {
		const { title, ingredients, grid, notes } = this.rendered;
		return (
			!title &&
			!ingredients.length &&
			!grid.rows &&
			!notes.length
		);
	}

	get displayIndex() {
		return DISPLAYS.indexOf(this.display);
	}

	get displayLabels() {
		return DISPLAY_LABELS;
	}

	get examples() {
		return EXAMPLES;
	}

	get placeholder() {
		return PLACEHOLDER;
	}

	get untouched() {
		const text = this.text.trim();
		return (
			!text ||
			text === SAMPLE.trim() ||
			EXAMPLES.some((e) => e.text.trim() === text)
		);
	}

	get copyText() {
		return this.copyFailed ? 'Copy failed' : 'Copy HTML';
	}

	get copyIcon() {
		return this.copyFailed ? AlertIcon : CopyIcon;
	}

	isDone = (cell: Cell) => this.done.has(`${cell.row}:${cell.col}`);

	setText = (text: string) => {
		this.text = text;
		if (this.#persists) save(text);
	};

	setAmount = (event: Event) => {
		this.amountRaw = (event.target as HTMLInputElement).value;
	};

	step = (delta: number) => {
		const min = this.baseline ? 1 : 0.25;
		this.amountRaw = String(Math.max(min, this.amount + delta));
	};

	stepKey = (event: KeyboardEvent) => {
		const delta = { ArrowUp: 1, ArrowDown: -1 }[event.key];
		if (!delta) return;
		event.preventDefault();
		this.step(delta);
	};

	setDisplay = (index: number) => {
		this.display = DISPLAYS[index] ?? 'written';
	};

	toggleDone = (cell: Cell) => {
		const key = `${cell.row}:${cell.col}`;
		const next = new Set(this.done);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		this.done = next;
	};

	loadExample = (id: string) => {
		const chosen = EXAMPLES.find((e) => e.id === id);
		if (!chosen) return;
		if (!this.untouched && !confirm('Discard recipe?')) return;
		this.setText(chosen.text);
		this.done = new Set();
	};

	reset = () => {
		if (!this.untouched && !confirm('Discard recipe?')) return;
		this.setText('');
		this.done = new Set();
	};

	copyHtml = async () => {
		const out = this.rendered;
		const html = toHtml(out);
		const text = toText(out);
		let ok = true;
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
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				ok = false;
			}
		}
		if (this.isDestroying) return;
		clearTimeout(this.#failedTimer);
		this.copyFailed = !ok;
		if (ok) this.toast.show(out.title || undefined);
		else
			this.#failedTimer = setTimeout(
				() => (this.copyFailed = false),
				2000,
			);
	};

	savePdf = () => {
		const frame = document.createElement('iframe');
		frame.setAttribute('aria-hidden', 'true');
		frame.className = 'rt-print';
		frame.srcdoc = toPrintable(this.rendered);
		frame.addEventListener('load', () => {
			const view = frame.contentWindow;
			if (!view) return;
			const drop = () => frame.remove();
			view.addEventListener('afterprint', drop, {
				once: true,
			});
			void Promise.resolve(view.document.fonts?.ready).then(
				() => {
					view.focus();
					view.print();
					setTimeout(drop, 60000);
				},
			);
		});
		document.body.append(frame);
	};

	measured = (height: number) => {
		if (height + 4 !== this.pictureHeight)
			this.pictureHeight = height + 4;
	};

	<template>
		<CanonSplit
			class="recipe-table"
			@halves={{true}}
			@collapsesTo={{150}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Picture
						@rendered={{this.rendered}}
						@blank={{this.blank}}
						@isDone={{this.isDone}}
						@onToggle={{this.toggleDone}}
						@onHeight={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<div class="rt-editor-head">
						<CanonHeading @text="Recipe" />
						<CanonButton
							data-action="new"
							@kind="cell"
							@text="New"
							@icon={{NewIcon}}
							@onClick={{this.reset}}
						/>
					</div>
					<MarkedEditor
						class="rt-editor"
						@text={{this.text}}
						@lines={{this.lines}}
						@placeholder={{this.placeholder}}
						@label="Recipe"
						@onInput={{this.setText}}
					>
						<:line as |line|>
							{{~#each
								line.runs
								as |run|
							~}}
								<span
									class="rt-t--{{run.kind}}"
								>{{run.text}}</span>
							{{~/each~}}
						</:line>
					</MarkedEditor>
					{{#each
						this.recipe.problems
						as |problem|
					}}
						<CanonStatus
							class="rt-problem"
							@text="line {{problem.line}}: {{problem.message}}"
							@tone="warn"
							@row={{true}}
						/>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonRow
						@title={{this.scaleTitle}}
						@form="flush"
						as |titleId|
					>
						<CanonStepper
							class="rt-scale"
							@onStep={{this.step}}
						>
							<input
								class="canon-stepper-field rt-amount"
								type="text"
								inputmode="decimal"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="done"
								aria-labelledby={{titleId}}
								value={{this.amountText}}
								{{on
									"input"
									this.setAmount
								}}
								{{on
									"keydown"
									this.stepKey
								}}
							/>
						</CanonStepper>
					</CanonRow>
					<CanonHeading @text="Units" />
					<CanonSegmented
						class="rt-units"
						aria-label="Units"
						@items={{this.displayLabels}}
						@selected={{this.displayIndex}}
						@onChange={{this.setDisplay}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonGrid>
						<CanonButton
							data-action="copy"
							class={{if
								this.copyFailed
								"rt-failed"
							}}
							@text={{this.copyText}}
							@icon={{this.copyIcon}}
							@disabled={{this.blank}}
							@onClick={{this.copyHtml}}
						/>
						<CanonButton
							data-action="pdf"
							@text="Save as PDF"
							@icon={{PrintIcon}}
							@iconStyle="oversized"
							@kind="primary"
							@disabled={{this.blank}}
							@onClick={{this.savePdf}}
						/>
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Examples" />
					{{#each
						this.examples key="id"
						as |example|
					}}
						<button
							type="button"
							class="rt-example"
							data-action="example"
							data-example={{example.id}}
							{{on
								"click"
								(fn
									this.loadExample
									example.id
								)
							}}
						>
							<span
								class="rt-example-name"
							>{{example.name}}</span>
							<span
								class="rt-example-category"
							>{{example.category}}</span>
						</button>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<div class="rt-about">
						<p>{{ABOUT}}</p>
						<p>You can download the
							ClaraScript reference as
							a PDF by
							<a
								href="/clarascript-reference.pdf"
								download
							>clicking here</a>.
							Thank you to Michael Chu
							for inventing Cooking
							For Engineers and
							based.cooking for some
							of the sample recipes.</p>
					</div>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
