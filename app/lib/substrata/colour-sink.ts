import { getColour, subscribeColour } from './colour-store';
import { getActiveLayerId } from './selection';
import { getSnapshot, isGestureActive } from './doc-store';
import { findLayer } from './layer-tree';
import { setFill, setTextProps } from './layer-ops';
import { deriveTextStyle, styleFields, textAccent } from './text-style';
import { updateToolSettings } from './tool-settings';

export function startColourSink(): () => void {
	return subscribeColour(() => {
		const hex = getColour().hex;
		updateToolSettings('pieces', { fill: hex });

		const id = getActiveLayerId();
		const doc = getSnapshot();
		const layer = doc && id ? findLayer(doc.layers, id) : null;
		if (!layer) return;
		if (layer.kind === 'shape' || layer.kind === 'freehand') {
			if (layer.fill !== hex)
				setFill(layer.id, hex, {
					transient: isGestureActive(),
				});
		} else if (layer.kind === 'text') {
			// recolour text accent
			if (textAccent(layer) !== hex) {
				setTextProps(
					layer.id,
					styleFields(
						deriveTextStyle(layer),
						hex,
						layer.fontSize,
					),
					{
						transient: isGestureActive(),
					},
				);
			}
		}
	});
}
