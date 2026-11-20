import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { fn } from '@ember/helper';
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
import {
	ALIGNS,
	DISTRIBUTES,
	arrange,
	canArrange,
	isLit,
	type ArrangeAction,
} from 'delphitools-v2/lib/substrata/arrange-ops';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import {
	getGuides,
	subscribeGuides,
	toggleGuide,
} from 'delphitools-v2/lib/substrata/guides-pref';
import {
	groupLayers,
	ungroupLayer,
} from 'delphitools-v2/lib/substrata/layer-ops';
import {
	findLayer,
	siblingListOf,
} from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getSelectedLayerIds,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import {
	getToolSettings,
	setTransformAsGroup,
	subscribeToolSettings,
	updateToolSettings,
} from 'delphitools-v2/lib/substrata/tool-settings';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

interface Signature {
	Args: {
		axis: 'row' | 'column';
		placement: CanonPlacement;
		compact: boolean;
	};
}

export const ACTIONS: Record<ArrangeAction, { title: string; icon: string }> = {
	alignLeft: { title: 'Align left', icon: 'align-start-vertical' },
	alignCentre: { title: 'Align centre', icon: 'align-center-vertical' },
	alignRight: { title: 'Align right', icon: 'align-end-vertical' },
	alignTop: { title: 'Align top', icon: 'align-start-horizontal' },
	alignMiddle: {
		title: 'Align middle',
		icon: 'align-center-horizontal',
	},
	alignBottom: { title: 'Align bottom', icon: 'align-end-horizontal' },
	distributeHorizontally: {
		title: 'Distribute horizontally',
		icon: 'align-horizontal-distribute-center',
	},
	distributeVertically: {
		title: 'Distribute vertically',
		icon: 'align-vertical-distribute-center',
	},
	rotateLeft: { title: 'Rotate left', icon: 'rotate-ccw' },
	rotateRight: { title: 'Rotate right', icon: 'rotate-cw' },
	flipHorizontal: { title: 'Flip horizontal', icon: 'flip-horizontal-2' },
	flipVertical: { title: 'Flip vertical', icon: 'flip-vertical-2' },
};

const TURN_CELLS = (
	['rotateLeft', 'rotateRight', 'flipHorizontal', 'flipVertical'] as const
).map((id) => ({ id, ...ACTIONS[id] }));

const TRANSFORM_MODES = ['Group', 'Separate'];

export default class MoveCells extends Component<Signature> {
	doc = new TrackedExternal(subscribe, getSnapshot);
	ids = new TrackedExternal(subscribeSelection, getSelectedLayerIds);
	guides = new TrackedExternal(subscribeGuides, getGuides);
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.ids.unsubscribe();
		this.guides.unsubscribe();
		this.ts.unsubscribe();
	}

	@cached
	get layer() {
		const doc = this.doc.current;
		const ids = this.ids.current;
		if (!doc || !ids.length) return null;
		if (!canArrange('rotateLeft', doc, ids)) return null;
		const primary = findLayer(doc.layers, ids.at(-1)!);
		const list = siblingListOf(doc.layers, ids[0]!);
		const same =
			!!list &&
			ids.every((id) => list.some((l) => l.id === id));
		return {
			canGroup: ids.length >= 2 && same,
			canUngroup:
				ids.length === 1 && primary?.kind === 'group',
			canDevelop:
				ids.length === 1 && primary?.kind === 'raster',
			doc,
			ids,
		};
	}

	named = (text: string) => (this.args.compact ? undefined : text);

	get showView() {
		return !(this.args.compact && this.layer);
	}

	get alignItems(): BarMenuEntry[] {
		const l = this.layer;
		const item = (id: ArrangeAction) => ({
			title: ACTIONS[id].title,
			icon: menuIcon(ACTIONS[id].icon),
			disabled: !l || !canArrange(id, l.doc, l.ids),
			run: () => arrange(id),
		});
		return [
			...ALIGNS.map(item),
			{ kind: 'separator' },
			...DISTRIBUTES.map(item),
		];
	}

	lit = (id: ArrangeAction) => {
		const l = this.layer;
		return !!l && isLit(id, l.doc, l.ids);
	};

	pressed = (id: ArrangeAction) =>
		id.startsWith('flip') ? String(this.lit(id)) : undefined;

	fit = () => viewport.fit();
	actual = () => viewport.setZoom(1);
	develop = () => {
		editorUi.developOpen = true;
	};
	group = () => groupLayers(getSelectedLayerIds());
	ungroup = () => {
		const id = getSelectedLayerIds()[0];
		if (id) ungroupLayer(id);
	};
	turn = (id: ArrangeAction) => arrange(id);

	get mode() {
		return this.ts.current.transformAsGroup ? 0 : 1;
	}

	setMode = (i: number) => setTransformAsGroup(i === 0);
	setSnap = () => toggleGuide('snap');
	setGrid = () => toggleGuide('grid');
	setNudge = (n: number) =>
		updateToolSettings('move', {
			nudge: Math.min(100, Math.max(1, n)),
		});

	<template>
		{{#if this.showView}}
			<Cells @axis={{@axis}} @small={{true}}>
				<Cell
					@label="Fit"
					@text="Fit"
					@onClick={{this.fit}}
				/>
				<Cell
					@label="100 %"
					@text="100 %"
					@onClick={{this.actual}}
				/>
			</Cells>
		{{/if}}
		{{#if this.layer}}
			<Cells @axis={{@axis}} @small={{true}}>
				{{#if this.layer.canDevelop}}
					<Cell
						@label="Develop"
						@text={{this.named "Develop"}}
						@icon="aperture"
						@onClick={{this.develop}}
					/>
				{{/if}}
				{{#if this.layer.canUngroup}}
					<Cell
						@label="Ungroup"
						@text={{this.named "Ungroup"}}
						@icon="ungroup"
						@onClick={{this.ungroup}}
					/>
				{{else}}
					<Cell
						@label="Group"
						@text={{this.named "Group"}}
						@icon="group"
						@disabled={{if
							this.layer.canGroup
							false
							true
						}}
						@onClick={{this.group}}
					/>
				{{/if}}
				{{#each TURN_CELLS as |t|}}
					<Cell
						@label={{t.title}}
						@icon={{t.icon}}
						@selected={{this.lit t.id}}
						aria-pressed={{this.pressed
							t.id
						}}
						@onClick={{fn this.turn t.id}}
					/>
				{{/each}}
				<MenuCell
					@label="Align"
					@icon="align-start-vertical"
					@items={{this.alignItems}}
					@placement={{@placement}}
				/>
			</Cells>
		{{/if}}
		<Cells @axis={{@axis}} @small={{true}}>
			<PopoverCell
				@label="Options"
				@icon="settings-2"
				@placement={{@placement}}
			>
				<CanonRows>
					<CanonRow
						@title="Transform"
						@form="flush"
						as |id|
					>
						<CanonSegmented
							@items={{TRANSFORM_MODES}}
							@selected={{this.mode}}
							@onChange={{this.setMode}}
							aria-labelledby={{id}}
						/>
					</CanonRow>
					<CanonRow @title="Snap" as |id|>
						<CanonSwitch
							@on={{this.guides.current.snap}}
							@onChange={{this.setSnap}}
							aria-labelledby={{id}}
						/>
					</CanonRow>
					<CanonRow @title="Grid" as |id|>
						<CanonSwitch
							@on={{this.guides.current.grid}}
							@onChange={{this.setGrid}}
							aria-labelledby={{id}}
						/>
					</CanonRow>
					<CanonRow
						@title="Nudge"
						@form="flush"
						as |id|
					>
						<CanonNumberField
							@value={{this.ts.current.move.nudge}}
							@min={{1}}
							@max={{100}}
							@unit="px"
							@labelledBy={{id}}
							@onChange={{this.setNudge}}
						/>
					</CanonRow>
				</CanonRows>
			</PopoverCell>
		</Cells>
	</template>
}
