import Component from '@glimmer/component';
import type { CanonPlacement } from 'delphicanon/lib/popover';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import { activeDoc, subscribeActive } from 'delphitools-v2/lib/errata/active';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class UndoCells extends Component<{
	Args: { tip?: CanonPlacement };
}> {
	noUndo = new TrackedExternal(
		subscribeActive,
		() => !(activeDoc()?.canUndo() ?? false),
	);
	noRedo = new TrackedExternal(
		subscribeActive,
		() => !(activeDoc()?.canRedo() ?? false),
	);

	willDestroy() {
		super.willDestroy();
		this.noUndo.unsubscribe();
		this.noRedo.unsubscribe();
	}

	undo = () => activeDoc()?.undo();
	redo = () => activeDoc()?.redo();

	<template>
		<Cell
			@tip={{@tip}}
			@label="Undo"
			@icon="undo-2"
			@disabled={{this.noUndo.current}}
			@onClick={{this.undo}}
		/>
		<Cell
			@tip={{@tip}}
			@label="Redo"
			@icon="redo-2"
			@disabled={{this.noRedo.current}}
			@onClick={{this.redo}}
		/>
	</template>
}
