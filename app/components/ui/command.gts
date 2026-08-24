// Vendored from shadcn-ember (MIT, IgnaceMaes/shadcn-ember) at v0.2.1 and
// restyled onto Crayon. The filtering, keyboard navigation and registration
// plumbing are kept as-is; Tailwind class strings become .dt-command* hooks.
//
// CommandDialog is dropped: it was the only thing pulling in ui/dialog, and the
// palette-strategy combobox renders inside a Popover instead.

import { registerDestructor } from '@ember/destroyable';
import { on } from '@ember/modifier';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { consume, provide } from 'ember-provide-consume-context';
import { TrackedArray } from 'tracked-built-ins';

import type { TOC } from '@ember/component/template-only';

import Icon from 'delphitools-v2/components/icon';

const CommandContext = 'command-context' as const;
const CommandGroupContext = 'command-group-context' as const;

interface CommandItemData {
	value: string;
	keywords: string[];
	isVisible: () => boolean;
	isDisabled: () => boolean;
}

interface CommandContextValue {
	search: string;
	setSearch: (value: string) => void;
	selectedValue: string | null;
	setSelectedValue: (value: string | null) => void;
	allGroups: CommandGroupContextValue[];
}

interface CommandGroupContextValue {
	items: CommandItemData[];
}

interface ContextRegistry {
	[CommandContext]: CommandContextValue;
	[CommandGroupContext]: CommandGroupContextValue;
}

interface CommandRootSignature {
	Element: HTMLDivElement;
	Args: {
		class?: string;
	};
	Blocks: {
		default: [];
	};
}

class Command extends Component<CommandRootSignature> {
	@tracked search = '';
	@tracked selectedValue: string | null = null;
	allGroups = new TrackedArray<CommandGroupContextValue>();

	get firstVisibleItem(): string | null {
		for (const group of this.allGroups) {
			for (const item of group.items) {
				if (item.isVisible() && !item.isDisabled()) {
					return item.value;
				}
			}
		}
		return null;
	}

	setSearch = (value: string) => {
		this.search = value;
		requestAnimationFrame(() => {
			this.selectedValue = this.firstVisibleItem;
		});
	};

	setSelectedValue = (value: string | null) => {
		this.selectedValue = value;
	};

	initializeSelection = modifier(() => {
		requestAnimationFrame(() => {
			this.selectedValue = this.firstVisibleItem;
		});
	});

	handleKeyDown = (event: KeyboardEvent) => {
		const key = event.key;

		if (
			key !== 'ArrowDown' &&
			key !== 'ArrowUp' &&
			key !== 'Enter'
		) {
			return;
		}

		event.preventDefault();

		if (key === 'Enter') {
			const currentTarget =
				event.currentTarget as HTMLElement;
			const selectedItem =
				currentTarget.querySelector<HTMLElement>(
					'[data-slot="command-item"][data-selected="true"]',
				);
			selectedItem?.click();
			return;
		}

		const currentTarget = event.currentTarget as HTMLElement;
		const items = Array.from(
			currentTarget.querySelectorAll<HTMLElement>(
				'[data-slot="command-item"]:not([hidden]):not([data-disabled="true"])',
			),
		);

		if (items.length === 0) return;

		const currentIndex = items.findIndex(
			(item) => item.getAttribute('data-selected') === 'true',
		);

		const newIndex =
			key === 'ArrowDown'
				? currentIndex === -1
					? 0
					: Math.min(
							currentIndex + 1,
							items.length - 1,
						)
				: currentIndex === -1
					? 0
					: Math.max(currentIndex - 1, 0);

		const newItem = items[newIndex];
		const value = newItem?.getAttribute('data-value');

		if (value && newItem) {
			this.selectedValue = value;
			newItem.scrollIntoView({
				block: 'nearest',
				behavior: 'smooth',
			});
		}
	};

	@provide(CommandContext)
	get context(): CommandContextValue {
		return {
			search: this.search,
			setSearch: this.setSearch,
			selectedValue: this.selectedValue,
			setSelectedValue: this.setSelectedValue,
			allGroups: this.allGroups,
		};
	}

	<template>
		<div
			aria-controls="command-list"
			aria-expanded="true"
			class="dt-command {{@class}}"
			data-slot="command"
			role="combobox"
			tabindex="0"
			{{on "keydown" this.handleKeyDown}}
			{{this.initializeSelection}}
			...attributes
		>
			{{yield}}
		</div>
	</template>
}

interface CommandInputSignature {
	Element: HTMLInputElement;
	Args: {
		class?: string;
		placeholder?: string;
		inputClass?: string;
	};
	Blocks: {
		default: [];
	};
}

class CommandInput extends Component<CommandInputSignature> {
	@consume(CommandContext)
	context!: ContextRegistry[typeof CommandContext];

	handleInput = (event: Event) => {
		const target = event.target as HTMLInputElement;
		this.context.setSearch(target.value);
	};

	preventDropdownClose = (event: Event) => {
		event.stopPropagation();
	};

	focusInput = modifier((element: HTMLInputElement) => {
		const isInDialogOrPopover =
			element.closest('[data-slot="dialog-content"]') ||
			element.closest('[data-slot="popover-content"]') ||
			element.closest(
				'[data-slot="dropdown-menu-sub-content"]',
			);

		if (isInDialogOrPopover) {
			requestAnimationFrame(() => {
				element.focus();
			});
		}
	});

	<template>
		{{! template-lint-disable no-invalid-interactive no-pointer-down-event-binding }}
		<div
			class="dt-command-search {{@class}}"
			data-slot="command-input-wrapper"
			role="search"
			{{on "click" this.preventDropdownClose}}
			{{on "mousedown" this.preventDropdownClose}}
		>
			<Icon @name="search" class="dt-command-search-icon" />
			<input
				class="dt-command-input {{@inputClass}}"
				data-slot="command-input"
				placeholder={{@placeholder}}
				type="text"
				value={{this.context.search}}
				{{on "input" this.handleInput}}
				{{this.focusInput}}
				...attributes
			/>
		</div>
	</template>
}

interface CommandListSignature {
	Element: HTMLDivElement;
	Args: {
		class?: string;
	};
	Blocks: {
		default: [];
	};
}

const CommandList: TOC<CommandListSignature> = <template>
	<div
		class="dt-command-list {{@class}}"
		data-slot="command-list"
		id="command-list"
		role="listbox"
		...attributes
	>
		{{yield}}
	</div>
</template>;

interface CommandEmptySignature {
	Element: HTMLDivElement;
	Args: {
		class?: string;
	};
	Blocks: {
		default: [];
	};
}

class CommandEmpty extends Component<CommandEmptySignature> {
	@consume(CommandContext)
	context!: ContextRegistry[typeof CommandContext];

	get hasVisibleItems(): boolean {
		return this.context.allGroups.some((group) =>
			group.items.some((item) => item.isVisible()),
		);
	}

	<template>
		{{#unless this.hasVisibleItems}}
			<div
				class="dt-command-empty {{@class}}"
				data-slot="command-empty"
				...attributes
			>
				{{yield}}
			</div>
		{{/unless}}
	</template>
}

interface CommandGroupSignature {
	Element: HTMLDivElement;
	Args: {
		class?: string;
		heading?: string;
	};
	Blocks: {
		default: [];
	};
}

class CommandGroup extends Component<CommandGroupSignature> {
	@consume(CommandContext)
	declare commandContext?: ContextRegistry[typeof CommandContext];
	items = new TrackedArray<CommandItemData>();

	@provide(CommandGroupContext)
	groupContext: CommandGroupContextValue = { items: this.items };

	get hasVisibleItems(): boolean {
		return this.items.some((item) => item.isVisible());
	}

	registerWithCommand = modifier(() => {
		if (!this.commandContext) return;

		// popover unmount: parent context gone
		const command = this.commandContext;
		command.allGroups.push(this.groupContext);

		registerDestructor(this, () => {
			const index = command.allGroups.indexOf(
				this.groupContext,
			);
			if (index > -1) {
				command.allGroups.splice(index, 1);
			}
		});
	});

	<template>
		<div
			class="dt-command-group {{@class}}"
			data-slot="command-group"
			hidden={{unless this.hasVisibleItems true}}
			{{this.registerWithCommand}}
			...attributes
		>
			{{#if @heading}}
				<div data-cmdk-group-heading>{{@heading}}</div>
			{{/if}}
			{{yield}}
		</div>
	</template>
}

interface CommandSeparatorSignature {
	Element: HTMLDivElement;
	Args: {
		class?: string;
	};
	Blocks: {
		default: [];
	};
}

class CommandSeparator extends Component<CommandSeparatorSignature> {
	@consume(CommandContext)
	context!: ContextRegistry[typeof CommandContext];

	get hasVisibleItems(): boolean {
		return this.context.allGroups.some((group) =>
			group.items.some((item) => item.isVisible()),
		);
	}

	<template>
		{{#if this.hasVisibleItems}}
			<div
				class="dt-command-separator {{@class}}"
				data-slot="command-separator"
				...attributes
			></div>
		{{/if}}
	</template>
}

interface CommandItemComponentSignature {
	Element: HTMLDivElement;
	Args: {
		class?: string;
		disabled?: boolean;
		value: string;
		keywords?: string[];
		onSelect?: (value: string) => void;
	};
	Blocks: {
		default: [];
	};
}

class CommandItem extends Component<CommandItemComponentSignature> {
	@consume(CommandContext)
	context!: ContextRegistry[typeof CommandContext];
	@consume(CommandGroupContext)
	declare groupContext?: ContextRegistry[typeof CommandGroupContext];

	get isVisible(): boolean {
		const search = this.context.search?.trim();
		if (!search) return true;

		const searchLower = search.toLowerCase();
		const value = this.args.value.toLowerCase();
		const keywords = this.args.keywords || [];

		return (
			value.includes(searchLower) ||
			keywords.some((keyword) =>
				keyword.toLowerCase().includes(searchLower),
			)
		);
	}

	get isSelected(): boolean {
		return this.context.selectedValue === this.args.value;
	}

	registerWithGroup = modifier(() => {
		if (!this.groupContext) return;

		const item: CommandItemData = {
			value: this.args.value,
			keywords: this.args.keywords || [],
			isVisible: () => this.isVisible,
			isDisabled: () => this.args.disabled ?? false,
		};

		// whole-subtree unmount drops context
		const group = this.groupContext;
		group.items.push(item);

		registerDestructor(this, () => {
			const index = group.items.indexOf(item);
			if (index > -1) {
				group.items.splice(index, 1);
			}
		});
	});

	handleClick = () => {
		if (!this.args.disabled && this.args.onSelect) {
			this.args.onSelect(this.args.value);
		}
	};

	handleMouseEnter = () => {
		if (!this.args.disabled) {
			this.context.setSelectedValue(this.args.value);
		}
	};

	<template>
		{{#if this.isVisible}}
			<div
				aria-selected={{if
					this.isSelected
					"true"
					"false"
				}}
				class="dt-command-item {{@class}}"
				data-disabled={{if @disabled "true" "false"}}
				data-selected={{if
					this.isSelected
					"true"
					"false"
				}}
				data-slot="command-item"
				data-value={{@value}}
				hidden={{unless this.isVisible true}}
				role="option"
				{{on "click" this.handleClick}}
				{{on
					"mouseenter"
					this.handleMouseEnter
					passive=true
				}}
				{{this.registerWithGroup}}
				...attributes
			>
				{{yield}}
			</div>
		{{/if}}
	</template>
}

interface CommandShortcutSignature {
	Element: HTMLSpanElement;
	Args: {
		class?: string;
	};
	Blocks: {
		default: [];
	};
}

const CommandShortcut: TOC<CommandShortcutSignature> = <template>
	<span
		class="dt-command-shortcut {{@class}}"
		data-slot="command-shortcut"
		...attributes
	>
		{{yield}}
	</span>
</template>;

export {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
	CommandSeparator,
};
