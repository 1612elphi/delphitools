import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import CanonButton from 'delphicanon/components/canon-button';
import CanonMathField, {
	type CanonMathFieldHandle,
} from 'delphicanon/components/canon-math-field';
import CanonMenu, {
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import CanonPopover from 'delphicanon/components/canon-popover';
import CanonStatus from 'delphicanon/components/canon-status';
import press from 'delphicanon/modifiers/canon-press';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	paint,
	palette,
	relations,
	type Relation,
} from 'delphitools-v2/components/tools/graph-calc/graph';

export interface GraphCurve {
	id: number;
	text: string;
	relation: Relation;
	colour: number;
	visible: boolean;
}

interface RowSignature {
	Args: {
		curve: GraphCurve;
		name: string;
		removable: boolean;
		invalid: boolean;
		handle: CanonMathFieldHandle;
		onText: (text: string) => void;
		onDone: () => void;
		onColour: (colour: number) => void;
		onRelation: (relation: Relation) => void;
		onVisibility: () => void;
		onRemove: () => void;
	};
}

const swatches = palette.map((entry, index) => ({
	index,
	label: `Colour ${index + 1}`,
	style: htmlSafe(`background: ${entry.fill}; color: ${entry.ink}`),
}));

export default class GraphFunctionRow extends Component<RowSignature> {
	get swatchStyle() {
		const { fill, ink } = paint(this.args.curve.colour);
		return this.args.curve.visible
			? htmlSafe(`background: ${fill}; color: ${ink}`)
			: htmlSafe(
					`background: color-mix(in srgb, ${fill} 25%, transparent); color: var(--canon-foreground)`,
				);
	}

	get swatchLabel() {
		return `Colour ${this.args.name}`;
	}

	get menu(): CanonMenuItem[] {
		return relations.map((title) => ({
			title,
			kind: 'radio',
			checked: title === this.args.curve.relation,
		}));
	}

	get editing() {
		return this.args.handle.field?.editing ?? false;
	}

	get showsError() {
		return this.args.invalid && !this.editing;
	}

	pickRelation = (item: CanonMenuItem) =>
		this.args.onRelation(item.title as Relation);

	pick = (index: number, close: () => void) => {
		close();
		if (index !== this.args.curve.colour) this.args.onColour(index);
	};

	<template>
		<div class="graph-function">
			<div class="graph-function-cells">
				<CanonPopover
					class="graph-colours"
					@placement="bottom-start"
				>
					<:trigger as |p|>
						<button
							type="button"
							class="graph-swatch"
							aria-label={{this.swatchLabel}}
							{{press}}
							{{p.trigger}}
						><span
								class="graph-swatch-fill"
								style={{this.swatchStyle}}
							>{{@name}}</span></button>
					</:trigger>
					<:content as |p|>
						<div
							class="graph-colours-grid"
							role="dialog"
							aria-label="Colour"
						>
							{{#each
								swatches
								as |swatch|
							}}
								{{! template-lint-disable no-autofocus-attribute }}
								<button
									type="button"
									class="graph-colour"
									style={{swatch.style}}
									aria-label={{swatch.label}}
									aria-pressed={{if
										(eq
											swatch.index
											@curve.colour
										)
										"true"
										"false"
									}}
									autofocus={{eq
										swatch.index
										@curve.colour
									}}
									{{press}}
									{{on
										"click"
										(fn
											this.pick
											swatch.index
											p.close
										)
									}}
								>
									{{#if
										(eq
											swatch.index
											@curve.colour
										)
									}}
										<IconSvg
											@name="check"
										/>
									{{/if}}
								</button>
							{{/each}}
						</div>
					</:content>
				</CanonPopover>
				<CanonMenu
					@items={{this.menu}}
					@onSelect={{this.pickRelation}}
					as |m|
				>
					<CanonButton
						class="graph-relation"
						@kind="cell"
						@text={{@curve.relation}}
						@label="Relation"
						{{m.trigger}}
					/>
				</CanonMenu>
				<CanonMathField
					class="graph-field"
					@text={{@curve.text}}
					@placeholder="sin(x)"
					@size={{20}}
					@handle={{@handle}}
					@onChange={{@onText}}
					@onCompletion={{@onDone}}
				/>
				<CanonButton
					class="graph-cell"
					@kind="cell"
					@icon={{if
						@curve.visible
						(component IconSvg name="eye")
						(component
							IconSvg name="eye-off"
						)
					}}
					@label={{if
						@curve.visible
						"Hide"
						"Show"
					}}
					@onClick={{@onVisibility}}
				/>
				{{#if @removable}}
					<CanonButton
						class="graph-cell"
						@kind="cell"
						@icon={{component
							IconSvg
							name="trash-2"
						}}
						@label="Remove"
						@onClick={{@onRemove}}
					/>
				{{/if}}
			</div>
			{{#if this.showsError}}
				<CanonStatus
					@text="Invalid expression"
					@tone="warn"
					@row={{true}}
				/>
			{{/if}}
		</div>
	</template>
}

const eq = (a: unknown, b: unknown) => a === b;
