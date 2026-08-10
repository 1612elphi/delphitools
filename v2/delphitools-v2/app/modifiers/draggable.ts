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
			/** selector resolved inside the element for the drag handle */
			handle?: string;
			disabled?: boolean;
			manager?: DragDropManager;
		};
	};
}

/**
 * `@dnd-kit/dom` Draggable as a modifier — the `useDraggable` binding the
 * Next components use, minus React. Recreated whenever a named arg changes;
 * cheap, and the entity re-registers itself with the manager.
 */
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
