import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	PopoverCell,
	menuIcon,
	type BarMenuEntry,
	type CanonPlacement,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { PRESET_SHAPES } from 'delphitools-v2/lib/substrata/preset-shapes';
import {
	getActiveSubs,
	setActiveSub,
	subscribeTool,
} from 'delphitools-v2/lib/substrata/tool';
import {
	getToolSettings,
	subscribeToolSettings,
	updateToolSettings,
	type PieceShape,
} from 'delphitools-v2/lib/substrata/tool-settings';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

interface Signature {
	Args: { axis: 'row' | 'column'; placement: CanonPlacement };
}

const KINDS: { shape: PieceShape; title: string; icon: string }[] = [
	{ shape: 'rectangle', title: 'Rectangle', icon: 'square' },
	{ shape: 'ellipse', title: 'Ellipse', icon: 'circle' },
	{ shape: 'line', title: 'Line', icon: 'slash' },
	{ shape: 'polygon', title: 'Polygon', icon: 'pentagon' },
	{ shape: 'star', title: 'Star', icon: 'star' },
	{ shape: 'symbol', title: 'Symbol', icon: 'shapes' },
];

const STYLE = { title: 'Style', icon: 'sliders-horizontal' };
const SYMBOLS = { title: 'Symbols', icon: 'shapes' };

export default class ShapeCells extends Component<Signature> {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);
	sub = new TrackedExternal(subscribeTool, () => getActiveSubs().pieces);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
		this.sub.unsubscribe();
	}

	get p() {
		return this.ts.current.pieces;
	}

	get kind(): PieceShape {
		return this.sub.current === 'pieces' ? 'symbol' : this.p.shape;
	}

	get kindTitle() {
		return KINDS.find((k) => k.shape === this.kind)?.title ?? '';
	}

	get isSymbol() {
		return this.kind === 'symbol';
	}

	get kindItems(): BarMenuEntry[] {
		return KINDS.map((k) => ({
			title: k.title,
			kind: 'radio',
			checked: k.shape === this.kind,
			icon: menuIcon(k.icon),
			run: () => this.pickKind(k.shape),
		}));
	}

	get strokeOn() {
		return this.p.stroke !== null;
	}

	get strokeStyle() {
		return htmlSafe(
			`background: ${this.p.stroke?.colour ?? 'none'}`,
		);
	}

	get innerPercent() {
		return Math.round(this.p.starInnerRatio * 100);
	}

	pickKind = (shape: PieceShape) => {
		updateToolSettings('pieces', { shape });
		setActiveSub(
			'pieces',
			shape === 'symbol' ? 'pieces' : 'primitives',
		);
	};

	pickSymbol = (symbolId: string) => {
		updateToolSettings('pieces', { shape: 'symbol', symbolId });
		setActiveSub('pieces', 'pieces');
	};

	toggleStroke = (on: boolean) =>
		updateToolSettings('pieces', {
			stroke: on ? { colour: '#1d1d1d', width: 2 } : null,
		});

	setStrokeWidth = (width: number) => {
		const stroke = this.p.stroke;
		if (stroke)
			updateToolSettings('pieces', {
				stroke: { ...stroke, width },
			});
	};

	openStrokeColour = () => {
		const stroke = this.p.stroke;
		if (!stroke) return;
		editorUi.openRingFor({
			hex: stroke.colour,
			alpha: 1,
			send: (colour) => {
				const now = getToolSettings().pieces.stroke;
				if (now)
					updateToolSettings('pieces', {
						stroke: { ...now, colour },
					});
			},
		});
	};

	setCorner = (cornerRadius: number) =>
		updateToolSettings('pieces', { cornerRadius });
	setSides = (sides: number) => updateToolSettings('pieces', { sides });
	setPoints = (starPoints: number) =>
		updateToolSettings('pieces', { starPoints });
	setInner = (v: number) =>
		updateToolSettings('pieces', { starInnerRatio: v / 100 });

	<template>
		<Cells @axis={{@axis}} @small={{true}}>
			<MenuCell
				@label="Shape"
				@text={{this.kindTitle}}
				@items={{this.kindItems}}
				@placement={{@placement}}
			/>
			{{#if this.isSymbol}}
				<PopoverCell
					@label={{SYMBOLS.title}}
					@icon={{SYMBOLS.icon}}
					@placement={{@placement}}
				>
					<div class="sub-bar-gallery">
						{{#each
							PRESET_SHAPES key="id"
							as |shape|
						}}
							<button
								type="button"
								class="sub-bar-glyph"
								title={{shape.name}}
								aria-label={{shape.name}}
								aria-pressed={{if
									(eq
										this.p.symbolId
										shape.id
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.pickSymbol
										shape.id
									)
								}}
							><svg
									viewBox="0 0 256 256"
									aria-hidden="true"
								><path
										d={{shape.d}}
										fill="currentColor"
									/></svg></button>
						{{/each}}
					</div>
				</PopoverCell>
			{{else}}
				<PopoverCell
					@label={{STYLE.title}}
					@icon={{STYLE.icon}}
					@placement={{@placement}}
				>
					<CanonRows>
						<CanonRow
							@title="Stroke"
							as |id|
						>
							<CanonSwitch
								@on={{this.strokeOn}}
								@onChange={{this.toggleStroke}}
								aria-labelledby={{id}}
							/>
						</CanonRow>
						{{#if this.p.stroke}}
							<CanonRow
								@title="Colour"
								as |id|
							>
								<button
									type="button"
									class="sub-bar-swatch"
									aria-labelledby={{id}}
									{{on
										"click"
										this.openStrokeColour
									}}
								><span
										style={{this.strokeStyle}}
									></span></button>
							</CanonRow>
							<CanonRow
								@title="Width"
								@form="flush"
								as |id|
							>
								<CanonNumberField
									@value={{this.p.stroke.width}}
									@min={{1}}
									@max={{100}}
									@unit="px"
									@labelledBy={{id}}
									@onChange={{this.setStrokeWidth}}
								/>
							</CanonRow>
						{{/if}}
						{{#if
							(eq
								this.kind
								"rectangle"
							)
						}}
							<CanonRow
								@title="Corner"
								@form="flush"
								as |id|
							>
								<CanonNumberField
									@value={{this.p.cornerRadius}}
									@min={{0}}
									@max={{250}}
									@unit="px"
									@labelledBy={{id}}
									@onChange={{this.setCorner}}
								/>
							</CanonRow>
						{{else if
							(eq this.kind "polygon")
						}}
							<CanonRow
								@title="Sides"
								@form="flush"
								as |id|
							>
								<CanonNumberField
									@value={{this.p.sides}}
									@min={{3}}
									@max={{12}}
									@labelledBy={{id}}
									@onChange={{this.setSides}}
								/>
							</CanonRow>
						{{else if
							(eq this.kind "star")
						}}
							<CanonRow
								@title="Points"
								@form="flush"
								as |id|
							>
								<CanonNumberField
									@value={{this.p.starPoints}}
									@min={{3}}
									@max={{12}}
									@labelledBy={{id}}
									@onChange={{this.setPoints}}
								/>
							</CanonRow>
							<CanonRow
								@title="Inner"
								@form="flush"
								as |id|
							>
								<CanonNumberField
									@value={{this.innerPercent}}
									@min={{10}}
									@max={{90}}
									@step={{5}}
									@unit="%"
									@labelledBy={{id}}
									@onChange={{this.setInner}}
								/>
							</CanonRow>
						{{/if}}
					</CanonRows>
				</PopoverCell>
			{{/if}}
		</Cells>
	</template>
}
