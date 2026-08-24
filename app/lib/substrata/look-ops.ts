/* looks use film-sim filters */

import type { Filter, Layer } from './doc-model';
import { addFx, removeFx, setFxParam } from './fx-ops';

const LOOK_TYPE = 'film-sim';

export function getLook(layer: Layer): Filter | null {
	return layer.filters.find((f) => f.type === LOOK_TYPE) ?? null;
}

/** one look per layer */
export function setLook(layerId: string, layer: Layer, presetId: string): void {
	const existing = getLook(layer);
	if (existing) {
		if (existing.params.preset !== presetId) {
			setFxParam(
				layerId,
				'filters',
				existing.id,
				'preset',
				presetId,
			);
		}
		return;
	}
	addFx(layerId, 'filters', LOOK_TYPE, { preset: presetId });
}

export function clearLook(layerId: string, layer: Layer): void {
	const look = getLook(layer);
	if (look) removeFx(layerId, 'filters', look.id);
}

export function setLookIntensity(
	layerId: string,
	layer: Layer,
	pct: number,
	opts?: { transient?: boolean },
): void {
	const look = getLook(layer);
	if (look)
		setFxParam(layerId, 'filters', look.id, 'intensity', pct, opts);
}
