import { modifier } from 'ember-modifier';
import { Droppable, type DragDropManager } from '@dnd-kit/dom';
import type { Data } from '@dnd-kit/abstract';
import type { CollisionDetector } from '@dnd-kit/collision';
import { dndManager } from 'delphitools-v2/lib/dnd';

export interface DroppableSignature {
	Element: HTMLElement;
	Args: {
		Positional: [];
		Named: {
			id: string | number;
			data?: Data;
			disabled?: boolean;
			collision?: CollisionDetector;
			manager?: DragDropManager;
		};
	};
}

export default modifier<DroppableSignature>((element, _positional, named) => {
	const droppable = new Droppable(
		{
			id: named.id,
			element,
			data: named.data,
			disabled: named.disabled ?? false,
			...(named.collision
				? { collisionDetector: named.collision }
				: {}),
		},
		named.manager ?? dndManager,
	);
	return () => droppable.destroy();
});
