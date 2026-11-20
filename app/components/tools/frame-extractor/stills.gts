import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import CanonMenu, {
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';

export interface Still {
	id: number;
	url: string;
	label: string;
	seconds: number;
	fileName: string;
	blob: Blob;
}

const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Remove = <template><IconSvg @name="x" /></template>;

export default class Stills extends Component<{
	Args: {
		stills: Still[];
		aspect: number;
		onSave: (still: Still) => void;
		onRemove: (still: Still) => void;
	};
}> {
	get style() {
		return htmlSafe(`--fx-aspect: ${this.args.aspect}`);
	}

	get menu(): CanonMenuEntry[] {
		return [
			{ title: passAlong('Download'), icon: Save },
			{ title: 'Remove', icon: Remove, destructive: true },
		];
	}

	pick = (still: Still, item: CanonMenuItem) => {
		if (item.destructive) this.args.onRemove(still);
		else this.args.onSave(still);
	};

	<template>
		<div class="fx-stills" style={{this.style}}>
			{{#each @stills key="id" as |still|}}
				<CanonMenu
					@items={{this.menu}}
					@onSelect={{fn this.pick still}}
					as |m|
				>
					<button
						type="button"
						class="fx-still"
						aria-label={{still.label}}
						{{m.trigger}}
					>
						<img
							class="fx-still-picture"
							src={{still.url}}
							alt=""
							draggable="false"
						/>
						<span
							class="fx-still-time"
						>{{still.label}}</span>
					</button>
				</CanonMenu>
			{{/each}}
		</div>
	</template>
}
