import {
	DragDropManager,
	KeyboardSensor,
	PointerActivationConstraints,
	PointerSensor,
} from '@dnd-kit/dom';

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
			// a11y plugin announces instructions
			KeyboardSensor,
		],
	});
}

export const dndManager = createDndManager();
