import Component from '@glimmer/component';
import type { DragEndEvent } from '@dnd-kit/dom';
import { isSortable } from '@dnd-kit/dom/sortable';
import { createDndManager } from 'delphitools-v2/lib/dnd';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import {
	setFxOrder,
	type FxItem,
	type FxStack,
} from 'delphitools-v2/lib/substrata/fx-ops';
import FxBlock from './fx-block';

interface Signature {
	Args: {
		layer: RasterLayer;
		stack: FxStack;
		items: FxItem[];
		openId: string | null;
		onToggle: (id: string) => void;
	};
}

export default class FxZone extends Component<Signature> {
	manager = createDndManager();

	constructor(
		...args: ConstructorParameters<typeof Component<Signature>>
	) {
		super(...args);
		this.manager.monitor.addEventListener('dragend', this.dropped);
	}

	willDestroy() {
		super.willDestroy();
		this.manager.destroy();
	}

	get rows() {
		return this.args.items.map((fx, index) => ({ fx, index }));
	}

	isOpen = (id: string) => id === this.args.openId;

	dropped = (event: DragEndEvent) => {
		if (event.canceled) return;
		const { source } = event.operation;
		if (!isSortable(source)) return;
		const from = source.initialIndex;
		const to = source.index;
		const ids = this.args.items.map((fx) => fx.id);
		if (from === to || !ids[from] || !ids[to]) return;
		const [moved] = ids.splice(from, 1);
		if (moved === undefined) return;
		ids.splice(to, 0, moved);
		setFxOrder(this.args.layer.id, this.args.stack, ids);
	};

	<template>
		<div class="sub-fxp-zone" data-stack={{@stack}}>
			{{#each this.rows key="fx.id" as |row|}}
				<FxBlock
					@layer={{@layer}}
					@stack={{@stack}}
					@fx={{row.fx}}
					@index={{row.index}}
					@open={{this.isOpen row.fx.id}}
					@onToggle={{@onToggle}}
					@manager={{this.manager}}
				/>
			{{/each}}
		</div>
	</template>
}
