import { modifier } from 'ember-modifier';
import {
	beginTransient,
	commitTransient,
} from 'delphitools-v2/lib/substrata/doc-store';

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export default modifier(
	(element: HTMLElement, [onMove]: [(x: number, y: number) => void]) => {
		let dragging = false;

		const emit = (clientX: number, clientY: number) => {
			const r = element.getBoundingClientRect();
			onMove(
				clamp01((clientX - r.left) / r.width),
				clamp01((clientY - r.top) / r.height),
			);
		};

		const onPointerDown = (e: PointerEvent) => {
			// prevent partial undo gestures
			if (dragging) return;
			dragging = true;
			element.setPointerCapture(e.pointerId);
			beginTransient();
			emit(e.clientX, e.clientY);
		};

		const onPointerMove = (e: PointerEvent) => {
			if (dragging) emit(e.clientX, e.clientY);
		};

		const onPointerUp = (e: PointerEvent) => {
			if (!dragging) return;
			dragging = false;
			element.releasePointerCapture?.(e.pointerId);
			commitTransient();
		};

		element.addEventListener('pointerdown', onPointerDown);
		element.addEventListener('pointermove', onPointerMove);
		element.addEventListener('pointerup', onPointerUp);
		element.addEventListener('pointercancel', onPointerUp);
		return () => {
			// commit active teardown gesture
			if (dragging) {
				dragging = false;
				commitTransient();
			}
			element.removeEventListener(
				'pointerdown',
				onPointerDown,
			);
			element.removeEventListener(
				'pointermove',
				onPointerMove,
			);
			element.removeEventListener('pointerup', onPointerUp);
			element.removeEventListener(
				'pointercancel',
				onPointerUp,
			);
		};
	},
);
