import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	PopoverCell,
	type CanonPlacement,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
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
	Args: { axis: 'row' | 'column'; placement: CanonPlacement };
}

const MARKERS = [
	{ sub: 'brush', title: 'Brush', icon: 'brush', sizes: [8, 16, 24, 48] },
	{
		sub: 'pencil',
		title: 'Pencil',
		icon: 'pencil',
		sizes: [2, 4, 6, 12],
	},
];

export default class DrawCells extends Component<Signature> {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);
	sub = new TrackedExternal(subscribeTool, () => getActiveSubs().pieces);

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
		this.sub.unsubscribe();
	}

	get marker() {
		return (
			MARKERS.find((m) => m.sub === this.sub.current) ??
			MARKERS[0]!
		);
	}

	get isBrush() {
		return this.marker.sub === 'brush';
	}

	get size() {
		const p = this.ts.current.pieces;
		return this.isBrush ? p.brushSize : p.pencilSize;
	}

	get sizeTitle() {
		return `${this.size} px`;
	}

	get sizeTitles() {
		return this.marker.sizes.map(String);
	}

	get sizeIndex() {
		const i = this.marker.sizes.indexOf(this.size);
		return i < 0 ? undefined : i;
	}

	pick = (sub: string) => setActiveSub('pieces', sub);

	setSize = (v: number) =>
		updateToolSettings(
			'pieces',
			this.isBrush ? { brushSize: v } : { pencilSize: v },
		);

	pickSize = (i: number) => this.setSize(this.marker.sizes[i]!);

	<template>
		<Cells @axis={{@axis}} @small={{true}}>
			{{#each MARKERS as |m|}}
				<Cell
					@label={{m.title}}
					@icon={{m.icon}}
					@selected={{eq this.sub.current m.sub}}
					aria-pressed={{if
						(eq this.sub.current m.sub)
						"true"
						"false"
					}}
					@onClick={{fn this.pick m.sub}}
				/>
			{{/each}}
		</Cells>
		<Cells @axis={{@axis}} @small={{true}}>
			<PopoverCell
				@label="Size"
				@text={{this.sizeTitle}}
				@placement={{@placement}}
			>
				<CanonRows>
					<CanonSegmented
						@items={{this.sizeTitles}}
						@selected={{this.sizeIndex}}
						@onChange={{this.pickSize}}
						aria-label="Size"
					/>
					<CanonRow
						@title="Size"
						@form="flush"
						as |id|
					>
						<CanonNumberField
							@value={{this.size}}
							@min={{1}}
							@max={{200}}
							@unit="px"
							@labelledBy={{id}}
							@onChange={{this.setSize}}
						/>
					</CanonRow>
				</CanonRows>
			</PopoverCell>
		</Cells>
	</template>
}
