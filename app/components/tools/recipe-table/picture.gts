import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { and, eq, not } from 'ember-truth-helpers';
import type { Cell, Rendered } from 'delphitools-v2/lib/recipe-layout';

interface PictureSignature {
	Args: {
		rendered: Rendered;
		blank: boolean;
		isDone: (cell: Cell) => boolean;
		onToggle: (cell: Cell) => void;
		onHeight: (height: number) => void;
	};
}

const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(element.offsetHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

const area = (cell: Cell) =>
	htmlSafe(
		`grid-area: ${cell.row + 1} / ${cell.col + 1} / span ${cell.rows} / span ${cell.cols}`,
	);
const columns = (cols: number) =>
	htmlSafe(
		`grid-template-columns: fit-content(12rem) repeat(${Math.max(0, cols - 1)}, minmax(4.5rem, 1fr))`,
	);

const Picture: TOC<PictureSignature> = <template>
	<div
		class="rt-picture"
		role="region"
		aria-label="Recipe Table"
		tabindex="0"
	>
		<div class="rt-card" {{reportHeight @onHeight}}>
			{{#if @blank}}
				<div class="rt-empty" aria-hidden="true"></div>
			{{/if}}
			{{#if @rendered.title}}
				<h2 class="rt-title">{{@rendered.title}}</h2>
			{{/if}}
			{{#if @rendered.ingredients.length}}
				<ul class="rt-shopping">
					{{#each
						@rendered.ingredients
						as |item|
					}}
						<li>
							<span
								class="rt-item"
							>{{item.name}}</span>
							{{#if item.amount}}
								<span
									class="rt-amount-of"
								>{{item.amount}}</span>
							{{/if}}
						</li>
					{{/each}}
				</ul>
			{{/if}}
			{{#if
				(and
					(not @rendered.grid.rows)
					@rendered.banners.length
				)
			}}
				<ol class="rt-notes">
					{{#each @rendered.banners as |note|}}
						<li>{{note}}</li>
					{{/each}}
				</ol>
			{{/if}}
			{{#if @rendered.notes.length}}
				<ol class="rt-notes">
					{{#each @rendered.notes as |note|}}
						<li>{{note}}</li>
					{{/each}}
				</ol>
			{{/if}}
			{{#if @rendered.grid.rows}}
				<div
					class="rt-grid"
					style={{columns @rendered.grid.cols}}
				>
					{{#each @rendered.grid.cells as |cell|}}
						{{#if (eq cell.kind "step")}}
							<button
								type="button"
								class="rt-cell is-step
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
										(@isDone
											cell
										)
										'is-done'
									}}"
								style={{area
									cell
								}}
								aria-pressed={{if
									(@isDone
										cell
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										@onToggle
										cell
									)
								}}
							>
								<span
									class="rt-label"
								>{{cell.text}}</span>
								{{#each
									cell.detail
									as |line|
								}}
									<span
										class="rt-detail"
									>{{line}}</span>
								{{/each}}
								{{#each
									cell.discard
									as |line|
								}}
									<span
										class="rt-discard"
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
										class="rt-name"
									>{{cell.name}}</span>
								{{/if}}
							</button>
						{{else}}
							<div
								class="rt-cell is-{{cell.kind}}
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
										class="rt-label"
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
										class="rt-label"
									>{{cell.text}}</span>
								{{/if}}
								{{#each
									cell.detail
									as |line|
								}}
									<span
										class="rt-detail"
									>{{line}}</span>
								{{/each}}
							</div>
						{{/if}}
					{{/each}}

					{{#each @rendered.grid.cells as |cell|}}
						{{#if cell.marks.length}}
							<span
								class="rt-marks"
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
										class="rt-mark"
									>{{mark}}</span>
								{{/each}}
							</span>
						{{/if}}
					{{/each}}
				</div>
			{{/if}}
		</div>
	</div>
</template>;

export default Picture;
