import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import { IconSvg } from 'delphitools-v2/components/icon';
import { ACTIONS } from 'delphitools-v2/components/substrata/editor/tool-bar/move-cells';
import {
	ALIGNS,
	DISTRIBUTES,
	TURNS,
	arrange,
	canArrange,
	isLit,
	type ArrangeAction,
} from 'delphitools-v2/lib/substrata/arrange-ops';
import type {
	Layer,
	SubstrataDoc,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	groupLayers,
	ungroupLayer,
} from 'delphitools-v2/lib/substrata/layer-ops';
import { isGroup } from 'delphitools-v2/lib/substrata/layer-tree';

interface Action {
	label: string;
	icon: string;
	run: () => void;
	disabled: boolean;
	lit?: boolean;
}

const pressed = (lit?: boolean) =>
	lit === undefined ? undefined : String(lit);

const ActionGrid: TOC<{
	Args: { actions: Action[]; columns?: number; titled?: boolean };
}> = <template>
	<CanonGrid class="sub-ip-arrange" @columns={{@columns}}>
		{{#each @actions as |a|}}
			<CanonButton
				@kind="segment"
				@text={{if @titled a.label ""}}
				@icon={{component IconSvg name=a.icon}}
				@label={{a.label}}
				@selected={{a.lit}}
				@disabled={{a.disabled}}
				@onClick={{a.run}}
				title={{a.label}}
				aria-pressed={{pressed a.lit}}
			/>
		{{/each}}
	</CanonGrid>
</template>;

export default class ArrangeSection extends Component<{
	Args: {
		doc: SubstrataDoc;
		selected: readonly string[];
		active: Layer | null;
	};
}> {
	#actions(ids: readonly ArrangeAction[], flips = false): Action[] {
		const { doc, selected } = this.args;
		return ids.map((id) => ({
			label: ACTIONS[id].title,
			icon: ACTIONS[id].icon,
			disabled: !canArrange(id, doc, selected),
			lit:
				flips && id.startsWith('flip')
					? isLit(id, doc, selected)
					: undefined,
			run: () => arrange(id),
		}));
	}

	get aligns() {
		return this.#actions(ALIGNS);
	}

	get distributes() {
		return this.#actions(DISTRIBUTES);
	}

	get turns() {
		return this.#actions(TURNS, true);
	}

	get grouping(): Action[] {
		const { active, selected } = this.args;
		return [
			{
				label: 'Group',
				icon: 'group',
				disabled: selected.length < 2,
				run: () => groupLayers(selected),
			},
			{
				label: 'Ungroup',
				icon: 'ungroup',
				disabled: !active || !isGroup(active),
				run: () => active && ungroupLayer(active.id),
			},
		];
	}

	<template>
		<CanonHeading @text="Align" />
		<ActionGrid @actions={{this.aligns}} @columns={{3}} />
		<CanonHeading @text="Distribute" />
		<ActionGrid @actions={{this.distributes}} />
		<CanonHeading @text="Rotate and flip" />
		<ActionGrid @actions={{this.turns}} />
		<CanonHeading @text="Group" />
		<ActionGrid @actions={{this.grouping}} @titled={{true}} />
	</template>
}
