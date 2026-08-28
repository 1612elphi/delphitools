import { modifier } from 'ember-modifier';
import { Draggable, type DragDropManager } from '@dnd-kit/dom';
import type { Data } from '@dnd-kit/abstract';
import { dndManager } from 'delphitools-v2/lib/dnd';

export interface DraggableSignature {
	Element: HTMLElement;
	Args: {
		Positional: [];
		Named: {
			id: string | number;
			data?: Data;
			handle?: string;
			disabled?: boolean;
			manager?: DragDropManager;
		};
	};
}

export default modifier<DraggableSignature>((element, _positional, named) => {
	const handle = named.handle
		? (element.querySelector(named.handle) ?? undefined)
		: undefined;
	const draggable = new Draggable(
		{
			id: named.id,
			element,
			handle,
			data: named.data,
			disabled: named.disabled ?? false,
		},
		named.manager ?? dndManager,
	);
	return () => draggable.destroy();
});
