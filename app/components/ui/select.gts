// Vendored from shadcn-ember (MIT, IgnaceMaes/shadcn-ember) at v0.2.1 and
// restyled onto Crayon. The context plumbing, floating-ui positioning and the
// portal are kept; Tailwind class strings become .dt-select* hooks.
//
// Three divergences from upstream:
//
// 1. Upstream's listbox cannot be operated from a keyboard at all — the items
//    are plain divs with a click handler and no key handling anywhere. This
//    adds the roving aria-activedescendant that role="listbox" implies:
//    arrows, Home/End, Enter, Escape, and focus returning to the trigger.
// 2. SelectTrigger's teardown read `this.context` again, which throws when the
//    whole subtree unmounts because the provider goes first. Same shape as the
//    bug already fixed in the vendored command.gts. The setter is captured at
//    registration instead.
// 3. SelectGroup, SelectLabel, SelectSeparator and the two scroll buttons are
//    dropped — nothing here uses them, and the content already scrolls itself.
//    They are ~10 lines each in the upstream registry entry if wanted.
//
// The open/close animation is load-bearing: SelectContent unmounts on
// animationend, so without the keyframes in app.scss it opens and never closes.

import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import {
	computePosition,
	flip,
	shift,
	offset,
	autoUpdate,
	type Placement,
} from '@floating-ui/dom';
import Component from '@glimmer/component';
import { tracked, cached } from '@glimmer/tracking';
import onClickOutside from 'ember-click-outside/modifiers/on-click-outside';
import { modifier } from 'ember-modifier';
import { provide, consume } from 'ember-provide-consume-context';
import { TrackedArray } from 'tracked-built-ins';

import Icon from 'delphitools-v2/components/icon';

const SelectContext = 'select-context' as const;

let uid = 0;

interface SelectItemRecord {
	id: string;
	value: string;
	disabled: boolean;
	/** Read lazily: the label is the item's rendered text. */
	label: () => string;
}

interface SelectContextValue {
	value: string;
	selectedLabel: string;
	isOpen: boolean;
	isRendered: boolean;
	disabled: boolean;
	activeValue: string;
	items: SelectItemRecord[];
	toggle: () => void;
	open: () => void;
	close: () => void;
	dismiss: () => void;
	finishClose: () => void;
	selectValue: (value: string, label: string) => void;
	setActive: (value: string) => void;
	move: (to: number | 'first' | 'last') => void;
	commitActive: () => void;
	register: (item: SelectItemRecord) => void;
	unregister: (item: SelectItemRecord) => void;
	triggerElement: HTMLElement | null;
	setTriggerElement: (element: HTMLElement | null) => void;
}

interface ContextRegistry {
	[SelectContext]: SelectContextValue;
}

export interface SelectSignature {
	Args: {
		/** Controlled value. Leave off to let the component hold its own. */
		value?: string;
		defaultValue?: string;
		/** Label to show before anything has been picked from the list. */
		valueLabel?: string;
		onValueChange?: (value: string) => void;
		disabled?: boolean;
	};
	Blocks: { default: [] };
}

class Select extends Component<SelectSignature> {
	@tracked isOpen = false;
	@tracked isRendered = false;
	@tracked selectedValue?: string;
	@tracked selectedLabel = '';
	@tracked activeValue = '';

	items = new TrackedArray<SelectItemRecord>();
	triggerElement: HTMLElement | null = null;

	get value() {
		return (
			this.args.value ??
			this.selectedValue ??
			this.args.defaultValue ??
			''
		);
	}

	get resolvedLabel() {
		return this.selectedLabel || this.args.valueLabel || '';
	}

	get enabledItems() {
		return this.items.filter((item) => !item.disabled);
	}

	open = () => {
		if (this.args.disabled) return;
		// Arrowing starts from the current selection, not the top of the list.
		this.activeValue =
			this.value || this.enabledItems[0]?.value || '';
		this.isRendered = true;
		this.isOpen = true;
	};

	toggle = () => {
		if (this.isOpen) this.close();
		else this.open();
	};

	close = () => {
		this.isOpen = false;
		this.triggerElement?.focus();
	};

	/** Close without pulling focus back, for a click that landed elsewhere. */
	dismiss = () => {
		this.isOpen = false;
	};

	finishClose = () => {
		if (!this.isOpen) this.isRendered = false;
	};

	selectValue = (value: string, label: string) => {
		this.selectedValue = value;
		this.selectedLabel = label;
		this.close();
		this.args.onValueChange?.(value);
	};

	setActive = (value: string) => {
		this.activeValue = value;
	};

	/** `to` is a step, or one end of the list. Movement does not wrap. */
	move = (to: number | 'first' | 'last') => {
		const list = this.enabledItems;
		if (list.length === 0) return;

		let next: SelectItemRecord | undefined;
		if (to === 'first') next = list[0];
		else if (to === 'last') next = list[list.length - 1];
		else {
			const at = list.findIndex(
				(item) => item.value === this.activeValue,
			);
			const target = at === -1 ? 0 : at + to;
			next =
				list[
					Math.min(
						Math.max(target, 0),
						list.length - 1,
					)
				];
		}
		if (next) this.activeValue = next.value;
	};

	commitActive = () => {
		const item = this.enabledItems.find(
			(candidate) => candidate.value === this.activeValue,
		);
		if (item) this.selectValue(item.value, item.label());
	};

	register = (item: SelectItemRecord) => {
		this.items.push(item);
	};

	unregister = (item: SelectItemRecord) => {
		const at = this.items.indexOf(item);
		if (at !== -1) this.items.splice(at, 1);
	};

	setTriggerElement = (element: HTMLElement | null) => {
		this.triggerElement = element;
	};

	@cached
	@provide(SelectContext)
	get context(): SelectContextValue {
		return {
			value: this.value,
			selectedLabel: this.resolvedLabel,
			isOpen: this.isOpen,
			isRendered: this.isRendered,
			disabled: this.args.disabled ?? false,
			activeValue: this.activeValue,
			items: this.items,
			toggle: this.toggle,
			open: this.open,
			close: this.close,
			dismiss: this.dismiss,
			finishClose: this.finishClose,
			selectValue: this.selectValue,
			setActive: this.setActive,
			move: this.move,
			commitActive: this.commitActive,
			register: this.register,
			unregister: this.unregister,
			triggerElement: this.triggerElement,
			setTriggerElement: this.setTriggerElement,
		};
	}

	<template>
		{{! template-lint-disable no-yield-only }}
		{{yield}}
	</template>
}

interface SelectTriggerSignature {
	Element: HTMLButtonElement;
	Blocks: { default: [] };
}

class SelectTrigger extends Component<SelectTriggerSignature> {
	@consume(SelectContext) context!: ContextRegistry[typeof SelectContext];

	// Captured at construction for two reasons: reading `this.context` in the
	// teardown throws on a whole-subtree unmount, because the provider is
	// destroyed first; and reading it in the body would re-run the modifier on
	// every state change, churning the element in and out.
	#setElement = this.context.setTriggerElement;

	registerElement = modifier((element: HTMLElement) => {
		this.#setElement(element);
		return () => this.#setElement(null);
	});

	handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			this.context.open();
		}
	};

	<template>
		<button
			type="button"
			class="dt-select-trigger"
			aria-haspopup="listbox"
			aria-expanded={{if this.context.isOpen "true" "false"}}
			disabled={{this.context.disabled}}
			{{on "click" this.context.toggle}}
			{{on "keydown" this.handleKeydown}}
			{{this.registerElement}}
			...attributes
		>
			{{yield}}
			<Icon @name="chevron-down" class="dt-select-chevron" />
		</button>
	</template>
}

interface SelectValueSignature {
	Element: HTMLSpanElement;
	Args: { placeholder?: string };
	Blocks: { default: [] };
}

class SelectValue extends Component<SelectValueSignature> {
	@consume(SelectContext) context!: ContextRegistry[typeof SelectContext];

	<template>
		<span class="dt-select-value" ...attributes>
			{{#if (has-block)}}
				{{yield}}
			{{else if this.context.selectedLabel}}
				{{this.context.selectedLabel}}
			{{else if this.context.value}}
				{{this.context.value}}
			{{else}}
				{{@placeholder}}
			{{/if}}
		</span>
	</template>
}

interface SelectContentSignature {
	Element: HTMLDivElement;
	Args: { align?: 'start' | 'center' | 'end' };
	Blocks: { default: [] };
}

const PLACEMENTS: Record<string, Placement> = {
	start: 'bottom-start',
	center: 'bottom',
	end: 'bottom-end',
};

class SelectContent extends Component<SelectContentSignature> {
	@consume(SelectContext) context!: ContextRegistry[typeof SelectContext];

	@tracked x = 0;
	@tracked y = 0;
	@tracked triggerWidth = 0;

	get destination() {
		return document.body;
	}

	get activeId() {
		return (
			this.context.items.find(
				(item) =>
					item.value === this.context.activeValue,
			)?.id ?? ''
		);
	}

	get positionStyle() {
		return htmlSafe(
			`left: ${this.x}px; top: ${this.y}px; --dt-select-trigger-width: ${this.triggerWidth}px;`,
		);
	}

	handleClickOutside = () => {
		// Not close(): that pulls focus back to the trigger, which is wrong
		// when the click landed somewhere else entirely.
		this.context.dismiss();
	};

	handleAnimationEnd = (event: AnimationEvent) => {
		if (
			event.target === event.currentTarget &&
			!this.context.isOpen
		)
			this.context.finishClose();
	};

	handleKeydown = (event: KeyboardEvent) => {
		switch (event.key) {
			case 'ArrowDown':
				this.context.move(1);
				break;
			case 'ArrowUp':
				this.context.move(-1);
				break;
			case 'Home':
				this.context.move('first');
				break;
			case 'End':
				this.context.move('last');
				break;
			case 'Enter':
			case ' ':
				this.context.commitActive();
				break;
			case 'Escape':
			case 'Tab':
				this.context.close();
				break;
			default:
				return;
		}
		event.preventDefault();
	};

	// The listbox takes focus so key events land here rather than on whatever
	// the trigger left focused.
	takeFocus = modifier((element: HTMLElement) => {
		element.focus();
	});

	position = modifier(
		(
			element: HTMLElement,
			[trigger]: [HTMLElement | null | undefined],
		) => {
			if (!trigger) return;

			const update = () => {
				void computePosition(trigger, element, {
					placement:
						PLACEMENTS[
							this.args.align ??
								'start'
						] ?? 'bottom-start',
					strategy: 'fixed',
					middleware: [
						offset(4),
						flip(),
						shift({ padding: 8 }),
					],
				}).then(({ x, y }) => {
					this.x = x;
					this.y = y;
					this.triggerWidth = trigger.offsetWidth;
				});
			};

			return autoUpdate(trigger, element, update);
		},
	);

	<template>
		{{#if this.context.isRendered}}
			{{#in-element this.destination insertBefore=null}}
				<div
					class="dt-select-content"
					role="listbox"
					{{! only mounted while open, so it is the tab stop for as long as it exists }}
					tabindex="0"
					aria-activedescendant={{this.activeId}}
					data-state={{if
						this.context.isOpen
						"open"
						"closed"
					}}
					style={{this.positionStyle}}
					{{on "keydown" this.handleKeydown}}
					{{on
						"animationend"
						this.handleAnimationEnd
					}}
					{{onClickOutside
						this.handleClickOutside
					}}
					{{this.position
						this.context.triggerElement
					}}
					{{this.takeFocus}}
					...attributes
				>
					{{yield}}
				</div>
			{{/in-element}}
		{{/if}}
	</template>
}

interface SelectItemSignature {
	Element: HTMLDivElement;
	Args: {
		value: string;
		disabled?: boolean;
	};
	Blocks: { default: [] };
}

class SelectItem extends Component<SelectItemSignature> {
	@consume(SelectContext) context!: ContextRegistry[typeof SelectContext];

	id = `dt-select-item-${uid++}`;
	element: HTMLElement | null = null;

	// Captured at construction, not read inside the modifier below. `context`
	// is a cached getter that recomputes on every arrow key, and a modifier
	// body that reads it re-runs each time — unregistering and re-registering
	// this item, which writes to `items` after SelectContent has already read
	// it. Glimmer rejects that as a backtracking update.
	#register = this.context.register;
	#unregister = this.context.unregister;

	get isSelected() {
		return this.args.value === this.context.value;
	}

	get isActive() {
		return this.args.value === this.context.activeValue;
	}

	handleClick = () => {
		if (this.args.disabled) return;
		this.context.selectValue(this.args.value, this.label());
	};

	// Pointer movement drives the same active item the arrows do, so the two
	// cannot disagree about what Enter would pick.
	handlePointerMove = () => {
		if (!this.args.disabled)
			this.context.setActive(this.args.value);
	};

	label = () => this.element?.textContent?.trim() || this.args.value;

	register = modifier((element: HTMLElement) => {
		this.element = element;
		const record: SelectItemRecord = {
			id: this.id,
			value: this.args.value,
			disabled: this.args.disabled ?? false,
			label: this.label,
		};
		this.#register(record);
		return () => this.#unregister(record);
	});

	// Scroll the active item into view when the arrows move past the edge.
	reveal = modifier((element: HTMLElement, [active]: [boolean]) => {
		if (active) element.scrollIntoView({ block: 'nearest' });
	});

	<template>
		{{! template-lint-disable require-presentational-children }}
		<div
			class="dt-select-item"
			role="option"
			id={{this.id}}
			aria-selected={{if this.isSelected "true" "false"}}
			aria-disabled={{if @disabled "true"}}
			data-active={{if this.isActive "true"}}
			{{on "click" this.handleClick}}
			{{on "pointermove" this.handlePointerMove}}
			{{this.register}}
			{{this.reveal this.isActive}}
			...attributes
		>
			<span class="dt-select-check">
				{{#if this.isSelected}}
					<Icon @name="check" />
				{{/if}}
			</span>
			{{yield}}
		</div>
	</template>
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
