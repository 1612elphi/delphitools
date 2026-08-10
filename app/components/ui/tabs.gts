// Vendored from shadcn-ember (MIT, IgnaceMaes/shadcn-ember) at v0.2.1 and
// restyled onto Crayon. The context plumbing is kept; Tailwind class strings
// become .dt-tabs* hooks.
//
// Two divergences from upstream, the same shape as the ones in select.gts:
//
// 1. Upstream's tablist has no keyboard handling. role="tablist" promises
//    arrow-key movement between tabs and one tab stop for the whole set; this
//    adds the roving tabindex that delivers it, plus Home and End.
// 2. Triggers and panels are linked by id, so a screen reader can move from a
//    tab to the panel it controls. Upstream renders neither aria-controls nor
//    aria-labelledby.

import { on } from '@ember/modifier';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { provide, consume } from 'ember-provide-consume-context';
import { modifier } from 'ember-modifier';
import { TrackedArray } from 'tracked-built-ins';

import type { TOC } from '@ember/component/template-only';

const TabsContext = 'tabs-context' as const;

let uid = 0;

interface TabRecord {
	value: string;
	disabled: boolean;
	focus: () => void;
}

interface TabsContextValue {
	value: string;
	uid: number;
	tabs: TabRecord[];
	setValue: (value: string) => void;
	move: (to: number | 'first' | 'last') => void;
	register: (tab: TabRecord) => void;
	unregister: (tab: TabRecord) => void;
}

interface ContextRegistry {
	[TabsContext]: TabsContextValue;
}

export interface TabsSignature {
	Element: HTMLDivElement;
	Args: {
		defaultValue?: string;
		value?: string;
		onValueChange?: (value: string) => void;
	};
	Blocks: { default: [] };
}

class Tabs extends Component<TabsSignature> {
	@tracked currentValue?: string;

	uid = uid++;
	tabs = new TrackedArray<TabRecord>();

	get value() {
		return (
			this.args.value ??
			this.currentValue ??
			this.args.defaultValue ??
			''
		);
	}

	setValue = (value: string) => {
		this.currentValue = value;
		this.args.onValueChange?.(value);
	};

	/** Selection follows focus, which is the expected behaviour for tabs. */
	move = (to: number | 'first' | 'last') => {
		const list = this.tabs.filter((tab) => !tab.disabled);
		if (list.length === 0) return;

		let next: TabRecord | undefined;
		if (to === 'first') next = list[0];
		else if (to === 'last') next = list[list.length - 1];
		else {
			const at = list.findIndex(
				(tab) => tab.value === this.value,
			);
			// Wraps, unlike the listbox in select.gts: a tablist is a
			// ring and ArrowRight past the end returns to the start.
			next =
				list[
					(((at === -1 ? 0 : at + to) %
						list.length) +
						list.length) %
						list.length
				];
		}
		if (!next) return;
		this.setValue(next.value);
		next.focus();
	};

	register = (tab: TabRecord) => this.tabs.push(tab);

	unregister = (tab: TabRecord) => {
		const at = this.tabs.indexOf(tab);
		if (at !== -1) this.tabs.splice(at, 1);
	};

	@provide(TabsContext)
	get context(): TabsContextValue {
		return {
			value: this.value,
			uid: this.uid,
			tabs: this.tabs,
			setValue: this.setValue,
			move: this.move,
			register: this.register,
			unregister: this.unregister,
		};
	}

	<template>
		<div class="dt-tabs" ...attributes>
			{{yield}}
		</div>
	</template>
}

interface TabsListSignature {
	Element: HTMLDivElement;
	Blocks: { default: [] };
}

const TabsList: TOC<TabsListSignature> = <template>
	<div class="dt-tabs-list" role="tablist" ...attributes>
		{{yield}}
	</div>
</template>;

interface TabsTriggerSignature {
	Element: HTMLButtonElement;
	Args: {
		value: string;
		disabled?: boolean;
	};
	Blocks: { default: [] };
}

class TabsTrigger extends Component<TabsTriggerSignature> {
	@consume(TabsContext) context!: ContextRegistry[typeof TabsContext];

	element: HTMLElement | null = null;

	// Captured at construction, not read inside the modifier: `context` changes
	// whenever the selection does, and a modifier that reads it would tear this
	// tab out of the list and put it back on every click, writing to `tabs`
	// after the list had been read. Glimmer rejects that.
	#register = this.context.register;
	#unregister = this.context.unregister;

	get isActive() {
		return this.args.value === this.context.value;
	}

	get id() {
		return `dt-tab-${this.context.uid}-${this.args.value}`;
	}

	get panelId() {
		return `dt-tabpanel-${this.context.uid}-${this.args.value}`;
	}

	select = () => {
		if (!this.args.disabled) this.context.setValue(this.args.value);
	};

	handleKeydown = (event: KeyboardEvent) => {
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				this.context.move(1);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				this.context.move(-1);
				break;
			case 'Home':
				this.context.move('first');
				break;
			case 'End':
				this.context.move('last');
				break;
			default:
				return;
		}
		event.preventDefault();
	};

	register = modifier((element: HTMLElement) => {
		this.element = element;
		const record: TabRecord = {
			value: this.args.value,
			disabled: this.args.disabled ?? false,
			focus: () => element.focus(),
		};
		this.#register(record);
		return () => this.#unregister(record);
	});

	<template>
		<button
			type="button"
			class="dt-tabs-trigger"
			role="tab"
			id={{this.id}}
			aria-selected={{if this.isActive "true" "false"}}
			aria-controls={{this.panelId}}
			{{! one tab stop for the whole set; the arrows move within it }}
			tabindex={{if this.isActive "0" "-1"}}
			data-state={{if this.isActive "active" "inactive"}}
			disabled={{@disabled}}
			{{on "click" this.select}}
			{{on "keydown" this.handleKeydown}}
			{{this.register}}
			...attributes
		>
			{{yield}}
		</button>
	</template>
}

interface TabsContentSignature {
	Element: HTMLDivElement;
	Args: { value: string };
	Blocks: { default: [] };
}

class TabsContent extends Component<TabsContentSignature> {
	@consume(TabsContext) context!: ContextRegistry[typeof TabsContext];

	get isActive() {
		return this.args.value === this.context.value;
	}

	get id() {
		return `dt-tabpanel-${this.context.uid}-${this.args.value}`;
	}

	get labelledBy() {
		return `dt-tab-${this.context.uid}-${this.args.value}`;
	}

	<template>
		{{#if this.isActive}}
			<div
				class="dt-tabs-content"
				role="tabpanel"
				id={{this.id}}
				aria-labelledby={{this.labelledBy}}
				tabindex="0"
				...attributes
			>
				{{yield}}
			</div>
		{{/if}}
	</template>
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
