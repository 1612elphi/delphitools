import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';

export interface SwitchSignature {
	Element: HTMLInputElement;
	Args: {
		checked: boolean;
		onChange: (checked: boolean) => void;
		/** functional chrome — the control's accessible name */
		label?: string;
	};
}

function toggle(onChange: (checked: boolean) => void, event: Event) {
	onChange((event.target as HTMLInputElement).checked);
}

// Native checkbox with switch semantics, styled as the shadcn track + thumb
// in app.scss (.dt-switch). Not vendored: shadcn-ember's Switch is a Radix
// port this one native element replaces.
const Switch: TOC<SwitchSignature> = <template>
	<input
		type="checkbox"
		role="switch"
		class="dt-switch"
		checked={{@checked}}
		aria-checked={{if @checked "true" "false"}}
		aria-label={{@label}}
		...attributes
		{{on "change" (fn toggle @onChange)}}
	/>
</template>;

export default Switch;
