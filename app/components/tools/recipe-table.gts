import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { and, eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { parse } from 'delphitools-v2/lib/recipe-parse';
import { EXAMPLES } from 'delphitools-v2/lib/recipe-examples';
import { render, type Cell } from 'delphitools-v2/lib/recipe-layout';
import type { Display } from 'delphitools-v2/lib/recipe-scale';
import { toHtml, toPrintable, toText } from 'delphitools-v2/lib/recipe-export';

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

const STORAGE_KEY = 'dt-recipe-text';
const DISPLAYS: Display[] = ['written', 'metric', 'imperial'];
const DISPLAY_LABEL: Record<Display, string> = {
	written: 'Written',
	metric: 'Metric',
	imperial: 'Imperial',
};

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
		/* private mode */
	}
}

const area = (cell: Cell) =>
	htmlSafe(
		`grid-area: ${cell.row + 1} / ${cell.col + 1} / span ${cell.rows} / span ${cell.cols}`,
	);
const columns = (cols: number) =>
	htmlSafe(
		`grid-template-columns: max-content repeat(${Math.max(0, cols - 1)}, minmax(6.5rem, 1fr))`,
	);
const displayLabel = (display: Display) => DISPLAY_LABEL[display];

export default class RecipeTableTool extends Component {
	@tracked text = load();
	@tracked amountRaw: string | null = null;
	@tracked display: Display = 'written';
	@tracked done = new Set<string>();
	@tracked copyState: 'idle' | 'done' | 'failed' = 'idle';
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	@cached
	get recipe() {
		return parse(this.text);
	}

	get baseline() {
		return this.recipe.serves;
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

	get grid() {
		return this.rendered.grid;
	}

	get problems() {
		return this.recipe.problems;
	}

	get displays() {
		return DISPLAYS;
	}

	get examples() {
		return EXAMPLES;
	}

	// skip confirm for samples
	get untouched() {
		const text = this.text.trim();
		return (
			!text ||
			text === SAMPLE.trim() ||
			EXAMPLES.some((e) => e.text.trim() === text)
		);
	}

	get copyIcon() {
		if (this.copyState === 'done') return 'check';
		return this.copyState === 'failed' ? 'triangle-alert' : 'copy';
	}

	get copyLabel() {
		if (this.copyState === 'done') return 'Copied';
		return this.copyState === 'failed'
			? 'Copy failed'
			: 'Copy HTML';
	}

	// no cell identity; positional
	isDone = (cell: Cell) => this.done.has(`${cell.row}:${cell.col}`);

	setText = (event: Event) => {
		this.text = (event.target as HTMLTextAreaElement).value;
		save(this.text);
	};

	setAmount = (event: Event) => {
		this.amountRaw = (event.target as HTMLInputElement).value;
	};

	step = (delta: number) => {
		const min = this.baseline ? 1 : 0.25;
		this.amountRaw = String(Math.max(min, this.amount + delta));
	};

	setDisplay = (display: Display) => {
		this.display = display;
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
		this.text = chosen.text;
		save(this.text);
		this.done = new Set();
	};

	reset = () => {
		if (!confirm('Discard recipe?')) return;
		this.text = '';
		save(this.text);
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
			// clipboard needs https, focus
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				ok = false;
			}
		}
		this.copyState = ok ? 'done' : 'failed';
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copyState = 'idle'),
			2000,
		);
	};

	// prints exported html directly
	savePdf = () => {
		const frame = document.createElement('iframe');
		frame.setAttribute('aria-hidden', 'true');
		frame.className = 'dt-rt-print';
		frame.srcdoc = toPrintable(this.rendered);
		frame.addEventListener('load', () => {
			const view = frame.contentWindow;
			if (!view) return;
			const drop = () => frame.remove();
			view.addEventListener('afterprint', drop, {
				once: true,
			});
			// await fonts before print
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

				<span class="dt-rt-spacer"></span>

				<button
					type="button"
					class="dt-rt-btn"
					data-action="new"
					{{on "click" this.reset}}
				>
					<Icon @name="file-plus" />
					<span>New</span>
				</button>
				<button
					type="button"
					class="dt-rt-btn
						{{if
							(eq
								this.copyState
								'failed'
							)
							'is-failed'
						}}"
					data-action="copy"
					{{on "click" this.copyHtml}}
				>
					<Icon @name={{this.copyIcon}} />
					<span>{{this.copyLabel}}</span>
				</button>
				<button
					type="button"
					class="dt-rt-btn is-primary"
					data-action="pdf"
					{{on "click" this.savePdf}}
				>
					<Icon @name="printer" />
					<span>Save as PDF</span>
				</button>
			</div>

			<div class="dt-rt-body">
				<div class="dt-rt-source">
					<textarea
						class="dt-rt-text"
						aria-label="Recipe"
						spellcheck="false"
						value={{this.text}}
						{{on "input" this.setText}}
					></textarea>
					{{#if this.problems.length}}
						<ul
							class="dt-rt-problems"
							role="status"
						>
							{{#each
								this.problems
								as |problem|
							}}
								<li>line
									{{problem.line}}:
									{{problem.message}}</li>
							{{/each}}
						</ul>
					{{/if}}
				</div>

				<div class="dt-rt-table">
					{{#if this.rendered.title}}
						<h2
							class="dt-rt-title"
						>{{this.rendered.title}}</h2>
					{{/if}}
					{{#if this.rendered.ingredients.length}}
						<ul class="dt-rt-shopping">
							{{#each
								this.rendered.ingredients
								as |item|
							}}
								<li>
									<span
										class="dt-rt-item"
									>{{item.name}}</span>
									{{#if
										item.amount
									}}
										<span
											class="dt-rt-amount-of"
										>{{item.amount}}</span>
									{{/if}}
								</li>
							{{/each}}
						</ul>
					{{/if}}
					{{#if
						(and
							(not this.grid.rows)
							this.rendered.banners.length
						)
					}}
						<ol class="dt-rt-notes">
							{{#each
								this.rendered.banners
								as |note|
							}}
								<li
								>{{note}}</li>
							{{/each}}
						</ol>
					{{/if}}
					{{#if this.rendered.notes.length}}
						<ol class="dt-rt-notes">
							{{#each
								this.rendered.notes
								as |note|
							}}
								<li
								>{{note}}</li>
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
										"step"
									)
								}}
									<button
										type="button"
										class="dt-rt-cell is-step
											{{if
												(eq
													cell.row
													0
												)
												'is-top'
											}}
											{{if
												(eq
													cell.col
													0
												)
												'is-left'
											}}
											{{if
												cell.vertical
												'is-vertical'
											}}
											{{if
												(this.isDone
													cell
												)
												'is-done'
											}}"
										style={{area
											cell
										}}
										aria-pressed={{if
											(this.isDone
												cell
											)
											"true"
											"false"
										}}
										{{on
											"click"
											(fn
												this.toggleDone
												cell
											)
										}}
									>
										<span
											class="dt-rt-label"
										>{{cell.text}}</span>
										{{#each
											cell.detail
											as |line|
										}}
											<span
												class="dt-rt-detail"
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
											cell.name
										}}
											<span
												class="dt-rt-name"
											>{{cell.name}}</span>
										{{/if}}
									</button>
								{{else}}
									<div
										class="dt-rt-cell is-{{cell.kind}}
											{{if
												(eq
													cell.row
													0
												)
												'is-top'
											}}
											{{if
												(eq
													cell.col
													0
												)
												'is-left'
											}}"
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
											cell.detail
											as |line|
										}}
											<span
												class="dt-rt-detail"
											>{{line}}</span>
										{{/each}}
									</div>
								{{/if}}
							{{/each}}

							{{! badges above all cells }}
							{{#each
								this.grid.cells
								as |cell|
							}}
								{{#if
									cell.marks.length
								}}
									<span
										class="dt-rt-marks"
										aria-hidden="true"
										style={{area
											cell
										}}
									>
										{{#each
											cell.marks
											as |mark|
										}}
											<span
												class="dt-rt-mark"
											>{{mark}}</span>
										{{/each}}
									</span>
								{{/if}}
							{{/each}}
						</div>
					{{/if}}
				</div>
			</div>

		</div>

		<div class="dt-rt-about">
			<p>The Recipe Table experiment lets you write out
				recipes for cooking (or other things) and
				outputs them in a nice to read
				Cooking-For-Engineers style action table. The
				format is a plain text domain-specific-language
				called ClaraScript, named after my grandmother.</p>
			<p>You can download the ClaraScript reference as a PDF
				by
				<a
					href="/clarascript-reference.pdf"
					download
				>clicking here</a>. Thank you to Michael Chu for
				inventing Cooking For Engineers and
				based.cooking for some of the sample recipes.</p>
		</div>

		<div class="dt-rt-gallery-head">
			<span>Examples</span>
		</div>
		<div class="dt-rt-gallery">
			{{#each this.examples as |example|}}
				<button
					type="button"
					class="dt-rt-card"
					data-action="example"
					data-example={{example.id}}
					{{on
						"click"
						(fn this.loadExample example.id)
					}}
				>
					<span
						class="dt-rt-card-name"
					>{{example.name}}</span>
					<span
						class="dt-rt-card-category"
					>{{example.category}}</span>
				</button>
			{{/each}}
		</div>
	</template>
}
