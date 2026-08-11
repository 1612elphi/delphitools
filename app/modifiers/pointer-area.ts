import { modifier } from 'ember-modifier';
import {
	beginTransient,
	commitTransient,
} from 'delphitools-v2/lib/substrata/doc-store';

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Normalised (0–1) pointer position within the element, tracked through a drag
 * via pointer capture. `onMove(x, y)` fires on down and on every move — the
 * colour picker's shared drag surface (hue cube, sliders, prism, spectrum).
 *
 *   <div {{pointerArea this.write}}>
 *
 * The drag is bracketed as ONE doc gesture: with the colour sink live, every
 * move streams a fill edit into the doc, and begin/commit coalesce them into a
 * single undo step. Harmless when nothing consumes the colour — commitTransient
 * no-ops when the doc did not change.
 */
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
			// A second pointer landing mid-drag would re-open the transient and
			// overwrite the base with the half-finished doc, so the undo step
			// would cover only the tail of the gesture.
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
			// An open gesture must not outlive the surface: without the commit
			// doc-store's isGestureActive() stays true for the rest of the
			// session, which silently disables undo/redo.
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
