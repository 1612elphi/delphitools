import {
	DragDropManager,
	KeyboardSensor,
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
			// the Accessibility plugin announces keyboard instructions either way
			KeyboardSensor,
		],
	});
}

export const dndManager = createDndManager();
