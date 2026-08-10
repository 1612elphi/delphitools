import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import type { TextAlign } from 'delphitools-v2/lib/substrata/doc-model';
import {
	FONT_CHOICES,
	getUploadedFonts,
	subscribeFonts,
} from 'delphitools-v2/lib/substrata/fonts';
import {
	TEXT_STYLE_PRESETS,
	type TextStylePreset,
} from 'delphitools-v2/lib/substrata/text-style';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

function familyStyle(css: string) {
	return htmlSafe(`font-family: ${css}`);
}

function quotedFamilyStyle(family: string) {
	return htmlSafe(`font-family: "${family.replaceAll('"', '')}"`);
}

export interface FontSelectSignature {
	Element: HTMLElement;
	Args: {
		value: string;
		onChange: (family: string) => void;
	};
}

/** Font dropdown (Ruby 2026-07-06: dropdown, not buttons) — the three system
 *  stacks + session uploads, each previewed in its own face. Shared by the
 *  TEXT bloom and the Inspector. */
export class FontSelect extends Component<FontSelectSignature> {
	uploaded = new TrackedExternal(subscribeFonts, getUploadedFonts);

	willDestroy() {
		super.willDestroy();
		this.uploaded.unsubscribe();
	}

	// the vendored SelectValue's fallback shows the raw value ("sans") and
	// goes stale when @value changes externally — supply the label
	get valueLabel(): string {
		const choice = FONT_CHOICES.find(
			(c) => c.id === this.args.value,
		);
		return choice ? choice.label : this.args.value;
	}

	<template>
		<Select @value={{@value}} @onValueChange={{@onChange}}>
			<SelectTrigger
				class="sub-font-trigger"
				aria-label="Font"
				...attributes
			>
				<SelectValue>{{this.valueLabel}}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{{#each FONT_CHOICES key="id" as |c|}}
					<SelectItem
						@value={{c.id}}
						style={{familyStyle c.css}}
					>
						{{c.label}}
					</SelectItem>
				{{/each}}
				{{#each this.uploaded.current as |f|}}
					<SelectItem
						@value={{f}}
						style={{quotedFamilyStyle f}}
					>
						{{f}}
					</SelectItem>
				{{/each}}
			</SelectContent>
		</Select>
	</template>
}

/**
 * The four text styles as a flush segmented strip (Ruby 2026-07-06: regular ·
 * outline · on a pill · on a rectangle). Shared by the TEXT bloom (next text)
 * and the Inspector (selected text). Icons are glyph specimens — visual
 * chrome; the aria words are the standard style vocabulary.
 */
const StyleGlyph: TOC<{ Args: { preset: TextStylePreset } }> = <template>
	{{#if (eq @preset "regular")}}
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			aria-hidden="true"
		>
			<text
				x="7"
				y="11"
				text-anchor="middle"
				font-size="11"
				font-weight="700"
				fill="currentColor"
			>A</text>
		</svg>
	{{else if (eq @preset "outline")}}
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			aria-hidden="true"
		>
			<text
				x="7"
				y="11"
				text-anchor="middle"
				font-size="11"
				font-weight="700"
				fill="none"
				stroke="currentColor"
				stroke-width="0.9"
			>A</text>
		</svg>
	{{else}}
		<svg
			width="16"
			height="14"
			viewBox="0 0 16 14"
			aria-hidden="true"
		>
			<rect
				x="1"
				y="2.5"
				width="14"
				height="9"
				rx={{if (eq @preset "pill") "4.5" "1"}}
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
			/>
			<text
				x="8"
				y="10"
				text-anchor="middle"
				font-size="7.5"
				font-weight="700"
				fill="currentColor"
			>A</text>
		</svg>
	{{/if}}
</template>;

/** Object-level alignment (ratified M2-1) as a flush segmented strip — the
 *  TextStyleRow language. Shared by the TEXT bloom and the Inspector.
 *  Alignment words are standard type vocabulary (functional chrome). */
const ALIGN_OPTIONS: Array<{ id: TextAlign; label: string; icon: string }> = [
	{ id: 'left', label: 'Left', icon: 'align-left' },
	{ id: 'center', label: 'Centre', icon: 'align-center' },
	{ id: 'right', label: 'Right', icon: 'align-right' },
	{ id: 'justify', label: 'Justify', icon: 'align-justify' },
];

export interface TextAlignRowSignature {
	Element: HTMLSpanElement;
	Args: {
		value: TextAlign;
		onPick: (align: TextAlign) => void;
	};
}

export const TextAlignRow: TOC<TextAlignRowSignature> = <template>
	<span class="segmented sub-seg-4" ...attributes>
		{{#each ALIGN_OPTIONS key="id" as |o|}}
			<button
				type="button"
				class="sub-seg-cell
					{{if (eq @value o.id) 'is-active'}}"
				aria-label={{o.label}}
				title={{o.label}}
				{{on "click" (fn @onPick o.id)}}
			>
				<Icon @name={{o.icon}} />
			</button>
		{{/each}}
	</span>
</template>;

export interface TextStyleRowSignature {
	Element: HTMLSpanElement;
	Args: {
		value: TextStylePreset;
		onPick: (preset: TextStylePreset) => void;
	};
}

export const TextStyleRow: TOC<TextStyleRowSignature> = <template>
	<span class="segmented sub-seg-4" ...attributes>
		{{#each TEXT_STYLE_PRESETS key="id" as |o|}}
			<button
				type="button"
				class="sub-seg-cell
					{{if (eq @value o.id) 'is-active'}}"
				aria-label={{o.label}}
				title={{o.label}}
				{{on "click" (fn @onPick o.id)}}
			>
				<StyleGlyph @preset={{o.id}} />
			</button>
		{{/each}}
	</span>
</template>;
