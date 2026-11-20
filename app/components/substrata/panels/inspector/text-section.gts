import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonTextArea from 'delphicanon/components/canon-text-area';
import { IconSvg } from 'delphitools-v2/components/icon';
import type {
	TextAlign,
	TextLayer,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	beginTransient,
	commitTransient,
	isGestureActive,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	FONT_CHOICES,
	fontLabel,
	getUploadedFonts,
	subscribeFonts,
} from 'delphitools-v2/lib/substrata/fonts';
import { setTextProps } from 'delphitools-v2/lib/substrata/layer-ops';
import {
	DEFAULT_TEXT_PROPS,
	TEXT_STYLE_PRESETS,
	deriveTextStyle,
	styleFields,
	textAccent,
} from 'delphitools-v2/lib/substrata/text-style';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import ColourWell from './colour-well';
import NumField from './num-field';
import Presets from './presets';

const icon = (name: string): TOC<{ Args: object }> => <template>
	<IconSvg @name={{name}} />
</template>;

const ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];
const ALIGN_TITLES = ['Left', 'Centre', 'Right', 'Justify'];
const ALIGN_ICONS = [
	icon('align-left'),
	icon('align-center'),
	icon('align-right'),
	icon('align-justify'),
];
const STYLE_TITLES = TEXT_STYLE_PRESETS.map((p) => p.label);
const DIRECTIONS = ['ltr', 'rtl'] as const;
const DIRECTION_TITLES = ['LTR', 'RTL'];
const SIZE_PRESETS = [16, 24, 48, 96].map((v) => ({
	value: v,
	label: String(v),
}));
const WEIGHT_TITLES = [
	'Thin',
	'Extra Light',
	'Light',
	'Regular',
	'Medium',
	'Semi Bold',
	'Bold',
	'Extra Bold',
	'Black',
];
const WEIGHTS = WEIGHT_TITLES.map((_, i) => (i + 1) * 100);
const TYPING_SETTLE_MS = 600;

export default class TextSection extends Component<{
	Args: { layer: TextLayer };
}> {
	uploaded = new TrackedExternal(subscribeFonts, getUploadedFonts);
	#typingId: string | null = null;
	#began = false;
	#settle?: number;

	willDestroy() {
		super.willDestroy();
		this.uploaded.unsubscribe();
		this.settle();
	}

	get id() {
		return this.args.layer.id;
	}

	get families(): string[] {
		const ids = [
			...FONT_CHOICES.map((c) => c.id),
			...this.uploaded.current,
		];
		const family = this.args.layer.fontFamily;
		return ids.includes(family) ? ids : [...ids, family];
	}

	get familyTitles(): string[] {
		return this.families.map(fontLabel);
	}

	get familyIndex(): number {
		return this.families.indexOf(this.args.layer.fontFamily);
	}

	get weightIndex(): number {
		return WEIGHTS.indexOf(this.args.layer.fontWeight ?? 400);
	}

	get styleIndex(): number {
		const style = deriveTextStyle(this.args.layer);
		return TEXT_STYLE_PRESETS.findIndex((p) => p.id === style);
	}

	get alignIndex(): number {
		return ALIGNS.indexOf(
			this.args.layer.align ?? DEFAULT_TEXT_PROPS.align,
		);
	}

	get directionIndex(): number {
		return this.args.layer.direction === 'rtl' ? 1 : 0;
	}

	get lineHeight(): number {
		return (
			this.args.layer.lineHeight ??
			DEFAULT_TEXT_PROPS.lineHeight
		);
	}

	get charSpacing(): number {
		return (
			this.args.layer.charSpacing ??
			DEFAULT_TEXT_PROPS.charSpacing
		);
	}

	get accent(): string {
		return textAccent(this.args.layer);
	}

	typed = (text: string) => {
		if (this.#typingId === null) {
			this.#typingId = this.id;
			this.#began = !isGestureActive();
			if (this.#began) beginTransient();
		}
		setTextProps(this.#typingId, { text }, { transient: true });
		window.clearTimeout(this.#settle);
		this.#settle = window.setTimeout(this.settle, TYPING_SETTLE_MS);
	};

	settle = () => {
		window.clearTimeout(this.#settle);
		if (this.#began) commitTransient();
		this.#began = false;
		this.#typingId = null;
	};

	pickFamily = (index: number) => {
		const fontFamily = this.families[index];
		if (fontFamily) setTextProps(this.id, { fontFamily });
	};

	pickWeight = (index: number) => {
		const fontWeight = WEIGHTS[index];
		if (fontWeight) setTextProps(this.id, { fontWeight });
	};

	setSize = (fontSize: number) => setTextProps(this.id, { fontSize });

	pickStyle = (index: number) => {
		const preset = TEXT_STYLE_PRESETS[index];
		if (preset)
			setTextProps(
				this.id,
				styleFields(
					preset.id,
					this.accent,
					this.args.layer.fontSize,
				),
			);
	};

	applyColour = (hex: string, transient: boolean) => {
		const { layer } = this.args;
		setTextProps(
			layer.id,
			styleFields(
				deriveTextStyle(layer),
				hex,
				layer.fontSize,
			),
			{ transient },
		);
	};

	pickAlign = (index: number) => {
		const align = ALIGNS[index];
		if (align) setTextProps(this.id, { align });
	};

	setLineHeight = (lineHeight: number) =>
		setTextProps(this.id, { lineHeight });

	setCharSpacing = (charSpacing: number) =>
		setTextProps(this.id, { charSpacing });

	pickDirection = (index: number) => {
		const direction = DIRECTIONS[index];
		if (direction) setTextProps(this.id, { direction });
	};

	<template>
		<CanonHeading @text="Text" />
		<CanonRow @title="Content" @form="stacked" as |titleId|>
			<CanonTextArea
				class="sub-ip-content"
				@value={{@layer.text}}
				@placeholder="Text"
				@height={{96}}
				@onChange={{this.typed}}
				aria-labelledby={{titleId}}
				{{on "blur" this.settle}}
			/>
		</CanonRow>
		<CanonRow @title="Font" @form="flush" as |titleId|>
			<CanonMenuCell
				@items={{this.familyTitles}}
				@selected={{this.familyIndex}}
				@labelledBy={{titleId}}
				@onChange={{this.pickFamily}}
			/>
		</CanonRow>
		<CanonRow @title="Weight" @form="flush" as |titleId|>
			<CanonMenuCell
				@items={{WEIGHT_TITLES}}
				@selected={{this.weightIndex}}
				@labelledBy={{titleId}}
				@onChange={{this.pickWeight}}
			/>
		</CanonRow>
		<CanonRow @title="Size" @form="flush" as |titleId|>
			<NumField
				@value={{@layer.fontSize}}
				@onCommit={{this.setSize}}
				@min={{6}}
				@max={{400}}
				@unit="px"
				@labelledBy={{titleId}}
			/>
		</CanonRow>
		<Presets
			@options={{SIZE_PRESETS}}
			@value={{@layer.fontSize}}
			@onPick={{this.setSize}}
			aria-label="Size"
		/>
		<CanonRow @title="Style" @form="stacked" as |titleId|>
			<CanonSegmented
				@items={{STYLE_TITLES}}
				@selected={{this.styleIndex}}
				@columns={{2}}
				@onChange={{this.pickStyle}}
				aria-labelledby={{titleId}}
			/>
		</CanonRow>
		<CanonRow @title="Colour" @form="stacked">
			<ColourWell
				@hex={{this.accent}}
				@onApply={{this.applyColour}}
				@label="Text colour"
			/>
		</CanonRow>
		<CanonRow @title="Align" @form="stacked" as |titleId|>
			<CanonSegmented
				@items={{ALIGN_TITLES}}
				@icons={{ALIGN_ICONS}}
				@selected={{this.alignIndex}}
				@onChange={{this.pickAlign}}
				aria-labelledby={{titleId}}
			/>
		</CanonRow>
		<CanonRow @title="Line height" @form="flush" as |titleId|>
			<NumField
				@value={{this.lineHeight}}
				@onCommit={{this.setLineHeight}}
				@min={{0.5}}
				@max={{3}}
				@step={{0.1}}
				@decimals={{2}}
				@unit="×"
				@labelledBy={{titleId}}
			/>
		</CanonRow>
		<CanonRow @title="Spacing" @form="flush" as |titleId|>
			<NumField
				@value={{this.charSpacing}}
				@onCommit={{this.setCharSpacing}}
				@min={{-200}}
				@max={{800}}
				@step={{10}}
				@unit="‰"
				@labelledBy={{titleId}}
			/>
		</CanonRow>
		<CanonRow @title="Direction" @form="stacked" as |titleId|>
			<CanonSegmented
				@items={{DIRECTION_TITLES}}
				@selected={{this.directionIndex}}
				@onChange={{this.pickDirection}}
				aria-labelledby={{titleId}}
			/>
		</CanonRow>
	</template>
}
