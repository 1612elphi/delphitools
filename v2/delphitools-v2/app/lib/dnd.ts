import {
	DragDropManager,
	PointerActivationConstraints,
	PointerSensor,
} from '@dnd-kit/dom';

/**
 * Manager factory with the app's sensor tuning: a 4px activation distance,
 * as every Next PointerSensor in Substrata sets (the shell's AND the layers
 * panel's nested one) — grip and row clicks stay inert, drags start on real
 * movement. Isolated managers must come from here too, or they silently get
 * `@dnd-kit/dom`'s different defaults (200ms delay / 5px).
 */
export function createDndManager(): DragDropManager {
	return new DragDropManager({
		sensors: [
			PointerSensor.configure({
				activationConstraints: [
					new PointerActivationConstraints.Distance(
						{
							value: 4,
						},
					),
				],
			}),
		],
	});
}

/**
 * One manager for the whole editor — the role the Next app's root
 * `<DndContext>` plays for drag-to-dock. Surfaces that need isolated drag
 * semantics (the layers sort list) create their own via createDndManager and
 * pass it to the draggable/droppable/sortable modifiers.
 */
export const dndManager = createDndManager();
