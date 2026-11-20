import Component from '@glimmer/component';
import type { ComponentLike } from '@glint/template';
import CanonMenu, {
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import type { Sound } from 'delphitools-v2/components/tools/text-tool/gloss-pieces';

export interface LetterEdits {
	pick: (sound: Sound) => void;
	insert: (after: boolean, sound: Sound) => void;
	remove?: () => void;
}

interface GlossLetterSignature {
	Args: {
		sound: Sound;
		alternatives: Sound[];
		alphabet: (Sound | null)[];
		edits: LetterEdits;
	};
}

type Entry = CanonMenuEntry & {
	insert?: { after: boolean; sound: Sound };
	swap?: Sound;
	remove?: boolean;
};

const glyphs = new Map<string, ComponentLike>();
function glyphIcon(glyph: string): ComponentLike {
	let icon = glyphs.get(glyph);
	if (!icon) {
		icon = <template>
			<span class="gl-menu-glyph">{{glyph}}</span>
		</template>;
		glyphs.set(glyph, icon);
	}
	return icon;
}

const titled = (sound: Sound) =>
	sound.name ? `${sound.name} /${sound.ipa}/` : `/${sound.ipa}/`;

const insertMenus = new WeakMap<
	(Sound | null)[],
	{ before: Entry[]; after: Entry[] }
>();
function insertMenu(alphabet: (Sound | null)[], after: boolean): Entry[] {
	let menus = insertMenus.get(alphabet);
	if (!menus) {
		const list = (side: boolean) =>
			alphabet.map((sound): Entry =>
				sound
					? {
							title: titled(sound),
							icon: glyphIcon(
								sound.glyph,
							),
							insert: {
								after: side,
								sound,
							},
						}
					: { kind: 'separator' },
			);
		menus = { before: list(false), after: list(true) };
		insertMenus.set(alphabet, menus);
	}
	return after ? menus.after : menus.before;
}

export default class GlossLetter extends Component<GlossLetterSignature> {
	get label() {
		return titled(this.args.sound);
	}

	get showsIpa() {
		return this.args.sound.ipa !== this.args.sound.glyph;
	}

	get items(): Entry[] {
		const { sound, alternatives, edits } = this.args;
		return [
			{
				title: 'Insert before',
				items: insertMenu(this.args.alphabet, false),
			},
			{
				title: 'Insert after',
				items: insertMenu(this.args.alphabet, true),
			},
			{
				title: 'Remove',
				destructive: true,
				disabled: !edits.remove,
				remove: true,
			},
			{ kind: 'separator' },
			{
				title: this.label,
				kind: 'radio',
				checked: true,
				icon: glyphIcon(sound.glyph),
			},
			...alternatives.map((alternative): Entry => ({
				title: titled(alternative),
				kind: 'radio',
				checked: false,
				icon: glyphIcon(alternative.glyph),
				swap: alternative,
			})),
		];
	}

	select = (item: CanonMenuItem) => {
		const { insert, swap, remove } = item as Entry;
		const { edits } = this.args;
		if (insert) edits.insert(insert.after, insert.sound);
		else if (swap) edits.pick(swap);
		else if (remove) edits.remove?.();
	};

	<template>
		<CanonMenu
			class="gl-letter-menu"
			@items={{this.items}}
			@onSelect={{this.select}}
			as |menu|
		>
			<button
				type="button"
				class="gl-letter"
				aria-label={{this.label}}
				{{menu.trigger}}
			>
				<span
					class="gl-letter-glyph"
					aria-hidden="true"
				>{{@sound.glyph}}</span>
				<span
					class="gl-letter-name"
					aria-hidden="true"
				>{{@sound.name}}</span>
				{{#if this.showsIpa}}
					<span
						class="gl-letter-ipa"
						aria-hidden="true"
					>/{{@sound.ipa}}/</span>
				{{/if}}
			</button>
		</CanonMenu>
	</template>
}
