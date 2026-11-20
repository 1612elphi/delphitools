import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import FloatingCard, {
	MenuCard,
} from 'delphitools-v2/components/substrata/editor/floating-card';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import { EFFECT_REGISTRY } from 'delphitools-v2/lib/substrata/effects';
import { FILTER_REGISTRY } from 'delphitools-v2/lib/substrata/filters';
import {
	FX_ICONS,
	FX_ICON_FALLBACK,
} from 'delphitools-v2/lib/substrata/fx-icons';
import type { FxStack } from 'delphitools-v2/lib/substrata/fx-ops';

interface Group {
	stack: FxStack;
	heading: string;
	cards: { type: string; label: string; icon: string }[];
}

const card = (d: { type: string; label: string }) => ({
	type: d.type,
	label: d.label,
	icon: FX_ICONS[d.type] ?? FX_ICON_FALLBACK,
});

const GROUPS: Group[] = [
	{
		stack: 'filters',
		heading: 'Filters',
		cards: Object.values(FILTER_REGISTRY)
			.filter((d) => d.category === 'filter')
			.map(card),
	},
	{
		stack: 'effects',
		heading: 'Effects',
		cards: Object.values(EFFECT_REGISTRY).map(card),
	},
];

function keep(event: KeyboardEvent) {
	if (event.metaKey || event.ctrlKey || event.altKey) return;
	if (/^(Arrow|Backspace$|Delete$)/.test(event.key))
		event.stopPropagation();
}

interface Signature {
	Args: {
		anchor: HTMLElement;
		layer: RasterLayer;
		onPick: (stack: FxStack, type: string) => void;
		onClose: () => void;
	};
}

export default class FxPicker extends Component<Signature> {
	groups = GROUPS;

	get width() {
		const room =
			this.args.anchor.closest('.sub-ed')?.clientWidth ?? 432;
		return Math.min(416, room - 16);
	}

	taken = (stack: FxStack, type: string) =>
		(stack === 'effects'
			? this.args.layer.effects
			: this.args.layer.filters
		).some((fx) => fx.type === type);

	<template>
		<FloatingCard
			@anchor={{@anchor}}
			@width={{this.width}}
			@label="Add Effect"
			@onClose={{@onClose}}
		>
			<CanonRows class="sub-fxp-picker" {{on "keydown" keep}}>
				{{#each this.groups key="stack" as |g|}}
					<CanonHeading @text={{g.heading}} />
					<CanonGrid @columns={{4}}>
						{{#each
							g.cards key="type"
							as |c|
						}}
							<MenuCard
								@title={{c.label}}
								@icon={{c.icon}}
								@disabled={{this.taken
									g.stack
									c.type
								}}
								@onClick={{fn
									@onPick
									g.stack
									c.type
								}}
								data-fx-pick={{c.type}}
							/>
						{{/each}}
					</CanonGrid>
				{{/each}}
			</CanonRows>
		</FloatingCard>
	</template>
}
