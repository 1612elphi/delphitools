import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';

function knobStyle(x: number, y: number) {
	return htmlSafe(`left: ${x * 100}%; top: ${y * 100}%`);
}

export interface KnobSignature {
	Element: HTMLSpanElement;
	Args: { x: number; y: number };
}

export const Knob: TOC<KnobSignature> = <template>
	<span
		class="sub-cp-knob"
		style={{knobStyle @x @y}}
		aria-hidden="true"
		...attributes
	></span>
</template>;
