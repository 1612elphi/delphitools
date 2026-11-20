import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { eq, or } from 'ember-truth-helpers';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	PopoverCell,
	menuIcon,
	type BarMenuEntry,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import type { ShapeKind } from 'delphitools-v2/lib/errata/doc-model';
import {
	activeTool,
	toolSettings,
	updateToolSettings,
} from 'delphitools-v2/lib/errata/tool';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

type Shape = Exclude<ShapeKind, 'highlight'>;

const SHAPES: { shape: Shape; title: string; icon: string }[] = [
	{ shape: 'rect', title: 'Rectangle', icon: 'square' },
	{ shape: 'ellipse', title: 'Ellipse', icon: 'circle' },
	{ shape: 'line', title: 'Line', icon: 'minus' },
];

const FONT_SIZES = [10, 12, 14, 18];
const STROKES = [1, 2, 4, 8];

const titles = (values: number[]) => values.map(String);

export default class SettingsBar extends Component<{
	Args: { phone: boolean };
}> {
	tool = new TrackedExternal(activeTool.subscribe, activeTool.get);
	settings = new TrackedExternal(
		toolSettings.subscribe,
		toolSettings.get,
	);

	willDestroy() {
		super.willDestroy();
		this.tool.unsubscribe();
		this.settings.unsubscribe();
	}

	get s() {
		return this.settings.current;
	}

	get highlight() {
		return this.tool.current === 'highlight';
	}

	get colour(): string {
		return this.highlight ? this.s.highlightColour : this.s.colour;
	}

	get colourLabel() {
		return this.highlight ? 'Highlight colour' : 'Colour';
	}

	get rgb(): Rgb {
		return parseHex(this.colour) ?? [0, 0, 0];
	}

	get colourText() {
		return this.colour.toUpperCase();
	}

	get dotStyle() {
		return htmlSafe(`--err-colour: ${this.colour}`);
	}

	get shapeTitle() {
		return (
			SHAPES.find((c) => c.shape === this.s.shape)?.title ??
			''
		);
	}

	get shapeIcon() {
		return SHAPES.find((c) => c.shape === this.s.shape)?.icon;
	}

	get shapeItems(): BarMenuEntry[] {
		return SHAPES.map((c) => ({
			title: c.title,
			kind: 'radio',
			checked: c.shape === this.s.shape,
			icon: menuIcon(c.icon),
			run: () => updateToolSettings({ shape: c.shape }),
		}));
	}

	get fontIndex() {
		return FONT_SIZES.indexOf(this.s.fontSize);
	}

	get strokeIndex() {
		return STROKES.indexOf(this.s.strokeWidth);
	}

	setColour = (colour: Rgb) => {
		const value = hex(colour);
		if (this.highlight)
			updateToolSettings({ highlightColour: value });
		else updateToolSettings({ colour: value });
	};

	setFontSize = (fontSize: number) => updateToolSettings({ fontSize });
	pickFontSize = (i: number) =>
		updateToolSettings({ fontSize: FONT_SIZES[i]! });
	setStroke = (strokeWidth: number) =>
		updateToolSettings({ strokeWidth });
	pickStroke = (i: number) =>
		updateToolSettings({ strokeWidth: STROKES[i]! });

	zoomOut = () => viewport.zoomOut();
	zoomIn = () => viewport.zoomIn();
	fit = () => viewport.fit();
	actual = () => viewport.reset();

	<template>
		<div
			class="sub-ed-bar is-bottom"
			role="toolbar"
			aria-label="Tool settings"
			data-tool={{this.tool.current}}
			style={{this.dotStyle}}
		>
			{{#if
				(or
					(eq this.tool.current "select")
					(eq this.tool.current "content")
				)
			}}
				<Cells @axis="row" @small={{true}}>
					<Cell
						@label="Zoom out"
						@icon="zoom-out"
						@onClick={{this.zoomOut}}
					/>
					<Cell
						@label="Fit page"
						@text="Fit"
						@onClick={{this.fit}}
					/>
					<Cell
						@label="Actual size"
						@text="100 %"
						@onClick={{this.actual}}
					/>
					<Cell
						@label="Zoom in"
						@icon="zoom-in"
						@onClick={{this.zoomIn}}
					/>
				</Cells>
			{{else}}
				<Cells @axis="row" @small={{true}}>
					{{#if (eq this.tool.current "shape")}}
						<MenuCell
							@label="Shape"
							@text={{this.shapeTitle}}
							@icon={{this.shapeIcon}}
							@items={{this.shapeItems}}
							@placement="top"
						/>
					{{/if}}
					<PopoverCell
						@label={{this.colourLabel}}
						@text={{this.colourText}}
						@placement="top"
						class="err-colour-cell"
					>
						<CanonRows>
							<CanonColourWell
								@label={{this.colourLabel}}
								@colour={{this.rgb}}
								@onChange={{this.setColour}}
							/>
						</CanonRows>
					</PopoverCell>
					{{#if (eq this.tool.current "text")}}
						<PopoverCell
							@label="Size"
							@text="{{this.s.fontSize}} pt"
							@placement="top"
						>
							<CanonRows>
								<CanonSegmented
									@items={{titles
										FONT_SIZES
									}}
									@selected={{this.fontIndex}}
									@columns={{4}}
									@onChange={{this.pickFontSize}}
									aria-label="Size"
								/>
								<CanonRow
									@title="Size"
									@form="flush"
									as |id|
								>
									<CanonNumberField
										@value={{this.s.fontSize}}
										@min={{4}}
										@max={{200}}
										@unit="pt"
										@labelledBy={{id}}
										@onChange={{this.setFontSize}}
									/>
								</CanonRow>
							</CanonRows>
						</PopoverCell>
					{{else if
						(or
							(eq
								this.tool.current
								"ink"
							)
							(eq
								this.tool.current
								"shape"
							)
						)
					}}
						<PopoverCell
							@label="Size"
							@text="{{this.s.strokeWidth}} pt"
							@placement="top"
						>
							<CanonRows>
								<CanonSegmented
									@items={{titles
										STROKES
									}}
									@selected={{this.strokeIndex}}
									@columns={{4}}
									@onChange={{this.pickStroke}}
									aria-label="Size"
								/>
								<CanonRow
									@title="Size"
									@form="flush"
									as |id|
								>
									<CanonNumberField
										@value={{this.s.strokeWidth}}
										@min={{1}}
										@max={{32}}
										@unit="pt"
										@labelledBy={{id}}
										@onChange={{this.setStroke}}
									/>
								</CanonRow>
							</CanonRows>
						</PopoverCell>
					{{/if}}
				</Cells>
			{{/if}}
		</div>
	</template>
}
