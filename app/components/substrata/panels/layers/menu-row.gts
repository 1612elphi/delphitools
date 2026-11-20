import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import { IconSvg } from 'delphitools-v2/components/icon';

const MenuRow: TOC<{
	Args: {
		title: string;
		icon: string;
		hint?: string;
		disabled?: boolean;
		destructive?: boolean;
		onClick: () => void;
	};
	Element: HTMLButtonElement;
}> = <template>
	<button
		type="button"
		class="sub-menu-row {{if @destructive 'is-destructive'}}"
		disabled={{@disabled}}
		{{on "click" @onClick}}
		...attributes
	>
		<span class="sub-menu-row-icon"><IconSvg
				@name={{@icon}}
			/></span>
		<span class="sub-menu-row-title">{{@title}}</span>
		{{#if @hint}}
			<span
				class="sub-menu-row-hint"
				aria-hidden="true"
			>{{@hint}}</span>
		{{/if}}
	</button>
</template>;

export default MenuRow;
