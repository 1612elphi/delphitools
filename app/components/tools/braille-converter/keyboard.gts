import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonPopover from 'delphicanon/components/canon-popover';
import press from 'delphicanon/modifiers/canon-press';
import { IconSvg } from 'delphitools-v2/components/icon';
import { cell, dots } from 'delphitools-v2/lib/braille';

interface KeyboardSignature {
	Args: {
		onInsert: (text: string) => void;
		onDelete: () => void;
	};
}

const perkins: Record<string, number> = {
	f: 1,
	d: 2,
	s: 3,
	j: 4,
	k: 5,
	l: 6,
};
const keyOfDot = Object.fromEntries(
	Object.entries(perkins).map(([key, dot]) => [dot, key]),
);

const KeyboardIcon = <template><IconSvg @name="keyboard" /></template>;
const InsertIcon = <template><IconSvg @name="plus" /></template>;
const SpaceIcon = <template><IconSvg @name="space" /></template>;
const DeleteIcon = <template><IconSvg @name="delete" /></template>;

export default class BrailleKeyboard extends Component<KeyboardSignature> {
	@tracked raised: number[] = [];
	#held = new Set<string>();
	#chord: number[] = [];

	get current() {
		return cell(this.raised.join(''));
	}

	get cellDots() {
		return dots(this.current) || '—';
	}

	get cellLabel() {
		const raised = dots(this.current);
		return raised ? `Dots ${raised}` : 'Blank';
	}

	get toggles() {
		return [1, 2, 3, 4, 5, 6].map((dot) => ({
			dot,
			key: keyOfDot[dot],
			label: `Dot ${dot}`,
			raised: this.raised.includes(dot),
		}));
	}

	get empty() {
		return this.raised.length === 0;
	}

	toggle = (dot: number) => {
		this.raised = this.raised.includes(dot)
			? this.raised.filter((d) => d !== dot)
			: [...this.raised, dot];
	};

	insert = () => {
		if (this.empty) return;
		this.args.onInsert(this.current);
		this.raised = [];
	};

	space = () => this.args.onInsert(' ');

	keydown = (event: KeyboardEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const dot = perkins[event.key.toLowerCase()];
		if (dot !== undefined) {
			event.preventDefault();
			this.#held.add(event.key.toLowerCase());
			if (!this.#chord.includes(dot)) this.#chord.push(dot);
		} else if (event.key === ' ' && !this.#held.size) {
			event.preventDefault();
			this.space();
		} else if (event.key === 'Backspace') {
			event.preventDefault();
			this.args.onDelete();
		}
	};

	keyup = (event: KeyboardEvent) => {
		if (event.key === ' ') event.preventDefault();
		if (!this.#held.delete(event.key.toLowerCase())) return;
		if (this.#held.size || !this.#chord.length) return;
		this.args.onInsert(cell(this.#chord.join('')));
		this.#chord = [];
	};

	release = () => {
		this.#held.clear();
		this.#chord = [];
	};

	left = (event: FocusEvent) => {
		const panel = event.currentTarget as HTMLElement;
		if (!panel.contains(event.relatedTarget as Node | null))
			this.release();
	};

	toggled = (event: ToggleEvent) => {
		if (event.newState === 'closed') this.release();
	};

	<template>
		<CanonPopover
			class="brl-keyboard"
			@placement="bottom-end"
			{{on "toggle" this.toggled}}
		>
			<:trigger as |p|>
				<CanonButton
					@text="Keyboard"
					@icon={{KeyboardIcon}}
					{{p.trigger}}
				/>
			</:trigger>
			<:content>
				{{! template-lint-disable no-invalid-interactive }}
				<div
					class="brl-keyboard-panel"
					role="dialog"
					aria-label="Braille keyboard"
					{{on "keydown" this.keydown}}
					{{on "keyup" this.keyup}}
					{{on "focusout" this.left}}
				>
					<div class="brl-keyboard-cell">
						<output
							class="brl-keyboard-glyph"
							aria-label={{this.cellLabel}}
						>{{this.current}}</output>
						<span
							class="brl-keyboard-dots"
						>{{this.cellDots}}</span>
					</div>
					<div class="brl-keyboard-toggles">
						{{#each
							this.toggles
							as |toggle|
						}}
							{{! template-lint-disable no-autofocus-attribute }}
							<button
								type="button"
								class="brl-keyboard-dot"
								aria-label={{toggle.label}}
								aria-pressed={{if
									toggle.raised
									"true"
									"false"
								}}
								autofocus={{eq
									toggle.dot
									1
								}}
								{{press}}
								{{on
									"click"
									(fn
										this.toggle
										toggle.dot
									)
								}}
							>
								<span
									class="brl-keyboard-pip"
								></span>
								<span
									class="brl-keyboard-number"
								>{{toggle.dot}}</span>
								<kbd
									class="brl-keyboard-key"
								>{{toggle.key}}</kbd>
							</button>
						{{/each}}
					</div>
					<CanonGrid @columns={{3}}>
						<CanonButton
							@kind="primary"
							@text="Insert"
							@icon={{InsertIcon}}
							@disabled={{this.empty}}
							@onClick={{this.insert}}
						/>
						<CanonButton
							@text="Space"
							@icon={{SpaceIcon}}
							@onClick={{this.space}}
						/>
						<CanonButton
							@text="Backspace"
							@icon={{DeleteIcon}}
							@repeats={{true}}
							@onClick={{@onDelete}}
						/>
					</CanonGrid>
				</div>
			</:content>
		</CanonPopover>
	</template>
}

const eq = (a: unknown, b: unknown) => a === b;
