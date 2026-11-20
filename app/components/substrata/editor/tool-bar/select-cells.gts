import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	PopoverCell,
	menuIcon,
	type BarMenuEntry,
	type CanonPlacement,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import { getColour } from 'delphitools-v2/lib/substrata/colour-store';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import {
	clearPixelSelection,
	getPixelSelection,
	subscribePixelSelection,
} from 'delphitools-v2/lib/substrata/pixel-selection';
import {
	canOperateOnActive,
	clearSelectionPixels,
	cutSelection,
	extractSelection,
	featherSelection,
	fillSelection,
	growSelection,
	invertSelection,
	shrinkSelection,
} from 'delphitools-v2/lib/substrata/select-ops';
import {
	getActiveLayerId,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import {
	getActiveSubs,
	setActiveSub,
	subscribeTool,
} from 'delphitools-v2/lib/substrata/tool';
import {
	getToolSettings,
	subscribeToolSettings,
	updateToolSettings,
} from 'delphitools-v2/lib/substrata/tool-settings';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

interface Signature {
	Args: {
		axis: 'row' | 'column';
		placement: CanonPlacement;
		compact: boolean;
	};
}

const SHAPES = [
	{ sub: 'select', title: 'Rectangle', icon: 'square-dashed' },
	{ sub: 'lasso', title: 'Freehand', icon: 'lasso' },
	{ sub: 'wand', title: 'Automatic', icon: 'wand-sparkles' },
];

const MODES = {
	add: { title: 'Add', icon: 'square-plus' },
	remove: { title: 'Remove', icon: 'square-minus' },
};

const REFINES = [
	{ title: 'Grow', icon: 'expand', change: growSelection },
	{ title: 'Shrink', icon: 'shrink', change: shrinkSelection },
	{ title: 'Feather', icon: 'blend', change: featherSelection },
];

const WAND_MODES = ['Contiguous', 'Global'];
const REFINE_RADII = [2, 8, 32];

export default class SelectCells extends Component<Signature> {
	sel = new TrackedExternal(subscribePixelSelection, getPixelSelection);
	doc = new TrackedExternal(subscribe, getSnapshot);
	active = new TrackedExternal(subscribeSelection, getActiveLayerId);
	sub = new TrackedExternal(subscribeTool, () => getActiveSubs().select);
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.sel.unsubscribe();
		this.doc.unsubscribe();
		this.active.unsubscribe();
		this.sub.unsubscribe();
		this.ts.unsubscribe();
	}

	get s() {
		return this.ts.current.select;
	}

	get shape() {
		return (
			SHAPES.find((x) => x.sub === this.sub.current) ??
			SHAPES[0]!
		);
	}

	get shapeItems(): BarMenuEntry[] {
		return SHAPES.map((x) => ({
			title: x.title,
			kind: 'radio',
			checked: x.sub === this.sub.current,
			icon: menuIcon(x.icon),
			run: () => this.pickShape(x.sub),
		}));
	}

	get hasSelection() {
		return this.sel.current !== null;
	}

	get noSelection() {
		return !this.hasSelection;
	}

	get cannotTake() {
		void this.doc.current;
		void this.active.current;
		return !this.hasSelection || !canOperateOnActive();
	}

	get mode() {
		return this.s.removes ? MODES.remove : MODES.add;
	}

	get hasOptions() {
		return (
			this.sub.current === 'lasso' ||
			this.sub.current === 'wand'
		);
	}

	get refineItems(): BarMenuEntry[] {
		return REFINES.map((x) => ({
			title: x.title,
			icon: menuIcon(x.icon),
			items: REFINE_RADII.map((r) => ({
				title: `${r} px`,
				run: () => x.change(r),
			})),
		}));
	}

	pickShape = (sub: string) => setActiveSub('select', sub);

	toggleMode = () =>
		updateToolSettings('select', { removes: !this.s.removes });

	invert = () => invertSelection();
	copy = () => void extractSelection();
	cut = () => void cutSelection();
	fill = () => void fillSelection(getColour().hex);
	clear = () => void clearSelectionPixels();
	deselect = () => clearPixelSelection();

	setMagnetic = (magnetic: boolean) =>
		updateToolSettings('select', { magnetic });
	setSensitivity = (sensitivity: number) =>
		updateToolSettings('select', {
			sensitivity: Math.min(100, Math.max(0, sensitivity)),
		});
	setWandMode = (i: number) =>
		updateToolSettings('select', {
			wandMode: i === 0 ? 'flood' : 'global',
		});
	setTolerance = (tolerance: number) =>
		updateToolSettings('select', {
			tolerance: Math.min(255, Math.max(0, tolerance)),
		});

	get wandIndex() {
		return this.s.wandMode === 'flood' ? 0 : 1;
	}

	get sensitivityOff() {
		return !this.s.magnetic;
	}

	<template>
		<Cells @axis={{@axis}} @small={{true}}>
			{{#if @compact}}
				<MenuCell
					@label={{this.shape.title}}
					@icon={{this.shape.icon}}
					@items={{this.shapeItems}}
					@placement={{@placement}}
				/>
			{{else}}
				{{#each SHAPES as |x|}}
					<Cell
						@label={{x.title}}
						@icon={{x.icon}}
						@selected={{eq
							this.sub.current
							x.sub
						}}
						aria-pressed={{if
							(eq
								this.sub.current
								x.sub
							)
							"true"
							"false"
						}}
						@onClick={{fn
							this.pickShape
							x.sub
						}}
					/>
				{{/each}}
			{{/if}}
			{{#if this.hasOptions}}
				<PopoverCell
					@label="Options"
					@icon="settings-2"
					@placement={{@placement}}
				>
					<CanonRows>
						{{#if
							(eq
								this.sub.current
								"lasso"
							)
						}}
							<CanonRow
								@title="Magnetic"
								as |id|
							>
								<CanonSwitch
									@on={{this.s.magnetic}}
									@onChange={{this.setMagnetic}}
									aria-labelledby={{id}}
								/>
							</CanonRow>
							<CanonRow
								@title="Sensitivity"
								@form="flush"
								as |id|
							>
								<CanonNumberField
									@value={{this.s.sensitivity}}
									@min={{0}}
									@max={{100}}
									@step={{10}}
									@disabled={{this.sensitivityOff}}
									@labelledBy={{id}}
									@onChange={{this.setSensitivity}}
								/>
							</CanonRow>
						{{else}}
							<CanonRow
								@title="Mode"
								@form="flush"
								as |id|
							>
								<CanonSegmented
									@items={{WAND_MODES}}
									@selected={{this.wandIndex}}
									@onChange={{this.setWandMode}}
									aria-labelledby={{id}}
								/>
							</CanonRow>
							<CanonRow
								@title="Tolerance"
								@form="flush"
								as |id|
							>
								<CanonNumberField
									@value={{this.s.tolerance}}
									@min={{0}}
									@max={{255}}
									@step={{8}}
									@labelledBy={{id}}
									@onChange={{this.setTolerance}}
								/>
							</CanonRow>
						{{/if}}
					</CanonRows>
				</PopoverCell>
			{{/if}}
		</Cells>
		<Cells @axis={{@axis}} @small={{true}}>
			<Cell
				@label={{this.mode.title}}
				@icon={{this.mode.icon}}
				@selected={{this.s.removes}}
				aria-pressed={{if
					this.s.removes
					"true"
					"false"
				}}
				data-select-action="mode"
				@onClick={{this.toggleMode}}
			/>
		</Cells>
		<Cells @axis={{@axis}} @small={{true}}>
			<Cell
				@label="Invert"
				@icon="contrast"
				data-select-action="invert"
				@onClick={{this.invert}}
			/>
			<MenuCell
				@label="Refine"
				@icon="circle-dashed"
				@items={{this.refineItems}}
				@placement={{@placement}}
				@disabled={{this.noSelection}}
				data-select-action="refine"
			/>
			<Cell
				@label="Copy to Layer"
				@icon="copy-plus"
				@disabled={{this.cannotTake}}
				data-select-action="extract"
				@onClick={{this.copy}}
			/>
			<Cell
				@label="Cut to Layer"
				@icon="scissors"
				@disabled={{this.cannotTake}}
				data-select-action="cut"
				@onClick={{this.cut}}
			/>
			<Cell
				@label="Fill"
				@icon="paint-bucket"
				@disabled={{this.cannotTake}}
				data-select-action="fill"
				@onClick={{this.fill}}
			/>
			<Cell
				@label="Clear"
				@icon="trash-2"
				@disabled={{this.cannotTake}}
				data-select-action="clear"
				@onClick={{this.clear}}
			/>
			<Cell
				@label="Deselect"
				@icon="square-x"
				@disabled={{this.noSelection}}
				data-select-action="deselect"
				@onClick={{this.deselect}}
			/>
		</Cells>
	</template>
}
