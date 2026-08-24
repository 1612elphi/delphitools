// selection excludes document state
import type { MaskBounds, PixelMask } from './select-mask';
import { maskBounds, maskToCanvas, traceOutline } from './select-mask';

type Listener = () => void;

export interface PixelSelection {
	mask: PixelMask;
	bounds: MaskBounds;
	outline: Path2D;
	epoch: number;
}

let current: PixelSelection | null = null;
let epoch = 0;
const listeners = new Set<Listener>();

// cache alpha per epoch
let alphaCanvas: HTMLCanvasElement | null = null;
let alphaEpoch = -1;

function emit(): void {
	for (const l of listeners) l();
}

export function getPixelSelection(): PixelSelection | null {
	return current;
}

export function subscribePixelSelection(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function setPixelSelectionMask(mask: PixelMask): void {
	const bounds = maskBounds(mask);
	if (!bounds) {
		// empty masks clear selection
		clearPixelSelection();
		return;
	}
	epoch += 1;
	current = { mask, bounds, outline: traceOutline(mask), epoch };
	emit();
}

export function clearPixelSelection(): void {
	if (!current) return;
	epoch += 1;
	current = null;
	alphaCanvas = null;
	emit();
}

export function getSelectionAlphaCanvas(): HTMLCanvasElement | null {
	if (!current) return null;
	if (!alphaCanvas || alphaEpoch !== current.epoch) {
		alphaCanvas = maskToCanvas(current.mask);
		alphaEpoch = current.epoch;
	}
	return alphaCanvas;
}
