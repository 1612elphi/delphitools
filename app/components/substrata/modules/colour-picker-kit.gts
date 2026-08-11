import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';

/**
 * Shared primitives for the colour-picker modes (hue cube, HSV triangle,
 * sliders, swatches, prism, shade). The drag surface itself is the
 * `pointer-area` modifier; this file holds the knob every mode places on it, so
 * the marker stays identical across modes.
 */

function knobStyle(x: number, y: number) {
	return htmlSafe(`left: ${x * 100}%; top: ${y * 100}%`);
}

export interface KnobSignature {
	Element: HTMLSpanElement;
	Args: { x: number; y: number };
}

/** Draggable knob marker positioned by normalised (0–1) coordinates. */
export const Knob: TOC<KnobSignature> = <template>
	<span
		class="sub-cp-knob"
		style={{knobStyle @x @y}}
		aria-hidden="true"
		...attributes
	></span>
</template>;
