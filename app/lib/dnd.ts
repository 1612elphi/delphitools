import {
	DragDropManager,
	PointerActivationConstraints,
	PointerSensor,
} from '@dnd-kit/dom';

/** use four-pixel activation */
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

export const dndManager = createDndManager();
