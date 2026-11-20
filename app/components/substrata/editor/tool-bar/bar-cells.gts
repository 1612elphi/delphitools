import type { TOC } from '@ember/component/template-only';
import type { ComponentLike } from '@glint/template';
import CanonMenu, {
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import CanonPopover from 'delphicanon/components/canon-popover';
import type { CanonPlacement } from 'delphicanon/lib/popover';
import { IconSvg } from 'delphitools-v2/components/icon';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import './tools.css';

export type { CanonPlacement };

export type BarMenuItem = CanonMenuItem & { run?: () => void };
export type BarMenuEntry = BarMenuItem | CanonMenuEntry;

export function menuIcon(name: string): ComponentLike {
	return <template><IconSvg @name={{name}} /></template>;
}

function named(label: string, text?: string): string {
	return text ? `${label}: ${text}` : label;
}

function runItem(item: CanonMenuItem): void {
	(item as BarMenuItem).run?.();
}

export const MenuCell: TOC<{
	Args: {
		label: string;
		text?: string;
		icon?: string;
		items: BarMenuEntry[];
		placement: CanonPlacement;
		disabled?: boolean;
	};
	Element: HTMLButtonElement;
}> = <template>
	<CanonMenu
		@items={{@items}}
		@placement={{@placement}}
		@onSelect={{runItem}}
		as |m|
	>
		<Cell
			@label={{@label}}
			@text={{@text}}
			@icon={{@icon}}
			@disabled={{@disabled}}
			aria-label={{named @label @text}}
			...attributes
			{{m.trigger}}
		/>
	</CanonMenu>
</template>;

export const PopoverCell: TOC<{
	Args: {
		label: string;
		text?: string;
		icon?: string;
		placement: CanonPlacement;
		tip?: CanonPlacement;
	};
	Blocks: { default: [close: () => void] };
	Element: HTMLButtonElement;
}> = <template>
	<CanonPopover @placement={{@placement}} class="sub-bar-pop">
		<:trigger as |p|>
			<Cell
				@label={{@label}}
				@text={{@text}}
				@icon={{@icon}}
				@tip={{@tip}}
				aria-label={{named @label @text}}
				...attributes
				{{p.trigger}}
			/>
		</:trigger>
		<:content as |p|>
			<div
				class="sub-bar-pop-body"
				role="dialog"
				aria-label={{@label}}
			>{{yield p.close}}</div>
		</:content>
	</CanonPopover>
</template>;
