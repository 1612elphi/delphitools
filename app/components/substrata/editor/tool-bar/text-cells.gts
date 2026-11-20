import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	PopoverCell,
	menuIcon,
	type BarMenuEntry,
	type CanonPlacement,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import type { TextAlign } from 'delphitools-v2/lib/substrata/doc-model';
import { getSnapshot } from 'delphitools-v2/lib/substrata/doc-store';
import {
	FONT_CHOICES,
	fontLabel,
	getUploadedFonts,
	subscribeFonts,
	uploadLocalFont,
} from 'delphitools-v2/lib/substrata/fonts';
import { setTextProps } from 'delphitools-v2/lib/substrata/layer-ops';
import { findLayer } from 'delphitools-v2/lib/substrata/layer-tree';
import { getActiveLayerId } from 'delphitools-v2/lib/substrata/selection';
import {
	TEXT_STYLE_PRESETS,
	styleFields,
	textAccent,
	type TextStylePreset,
} from 'delphitools-v2/lib/substrata/text-style';
import {
	getToolSettings,
	subscribeToolSettings,
	updateToolSettings,
} from 'delphitools-v2/lib/substrata/tool-settings';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

interface Signature {
	Args: { axis: 'row' | 'column'; placement: CanonPlacement };
}

const SIZES = [24, 32, 48, 64, 96, 128, 192, 256];
const SIZE_TITLES = SIZES.map(String);

const UPLOAD = { title: 'Upload font', icon: 'upload' };

const ALIGNS: { id: TextAlign; title: string; icon: string }[] = [
	{ id: 'left', title: 'Left', icon: 'align-left' },
	{ id: 'center', title: 'Centre', icon: 'align-center' },
	{ id: 'right', title: 'Right', icon: 'align-right' },
	{ id: 'justify', title: 'Justify', icon: 'align-justify' },
];

export default class TextCells extends Component<Signature> {
	ts = new TrackedExternal(subscribeToolSettings, getToolSettings);
	fonts = new TrackedExternal(subscribeFonts, getUploadedFonts);
	#file: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.ts.unsubscribe();
		this.fonts.unsubscribe();
	}

	get t() {
		return this.ts.current.text;
	}

	get fontTitle() {
		return fontLabel(this.t.fontFamily);
	}

	get sizeTitle() {
		return `${this.t.fontSize} px`;
	}

	get sizeIndex() {
		const i = SIZES.indexOf(this.t.fontSize);
		return i < 0 ? undefined : i;
	}

	get styleTitle() {
		return (
			TEXT_STYLE_PRESETS.find((p) => p.id === this.t.style)
				?.label ?? ''
		);
	}

	get align() {
		return ALIGNS.find((a) => a.id === this.t.align) ?? ALIGNS[0]!;
	}

	get fontItems(): BarMenuEntry[] {
		const family = this.t.fontFamily;
		const radio = (id: string, title: string) => ({
			title,
			kind: 'radio' as const,
			checked: id === family,
			run: () => this.setFont(id),
		});
		return [
			...FONT_CHOICES.map((c) => radio(c.id, c.label)),
			...this.fonts.current.map((f) => radio(f, f)),
			{ kind: 'separator' },
			{
				title: UPLOAD.title,
				icon: menuIcon(UPLOAD.icon),
				run: () => this.#file?.click(),
			},
		];
	}

	get styleItems(): BarMenuEntry[] {
		return TEXT_STYLE_PRESETS.map((p) => ({
			title: p.label,
			kind: 'radio',
			checked: p.id === this.t.style,
			run: () => this.setStyle(p.id),
		}));
	}

	get alignItems(): BarMenuEntry[] {
		return ALIGNS.map((a) => ({
			title: a.title,
			kind: 'radio',
			checked: a.id === this.t.align,
			icon: menuIcon(a.icon),
			run: () => this.setAlign(a.id),
		}));
	}

	#activeText() {
		const id = getActiveLayerId();
		const doc = getSnapshot();
		const layer = doc && id ? findLayer(doc.layers, id) : null;
		return id && layer?.kind === 'text' ? { id, layer } : null;
	}

	#live(patch: {
		fontFamily?: string;
		fontSize?: number;
		align?: TextAlign;
	}) {
		const target = this.#activeText();
		if (target) setTextProps(target.id, patch);
	}

	setFont = (fontFamily: string) => {
		updateToolSettings('text', { fontFamily });
		this.#live({ fontFamily });
	};

	setSize = (fontSize: number) => {
		updateToolSettings('text', { fontSize });
		this.#live({ fontSize });
	};

	pickSize = (i: number) => this.setSize(SIZES[i]!);

	setAlign = (align: TextAlign) => {
		updateToolSettings('text', { align });
		this.#live({ align });
	};

	setStyle = (style: TextStylePreset) => {
		updateToolSettings('text', { style });
		const target = this.#activeText();
		if (target)
			setTextProps(
				target.id,
				styleFields(
					style,
					textAccent(target.layer),
					target.layer.fontSize,
				),
			);
	};

	registerFile = modifier((el: HTMLInputElement) => {
		this.#file = el;
		return () => {
			this.#file = null;
		};
	});

	onFile = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void uploadLocalFont(file).then(this.setFont);
	};

	<template>
		<Cells @axis={{@axis}} @small={{true}}>
			<MenuCell
				@label="Font"
				@text={{this.fontTitle}}
				@items={{this.fontItems}}
				@placement={{@placement}}
			/>
			<PopoverCell
				@label="Size"
				@text={{this.sizeTitle}}
				@placement={{@placement}}
			>
				<CanonRows>
					<CanonSegmented
						@items={{SIZE_TITLES}}
						@selected={{this.sizeIndex}}
						@columns={{4}}
						@onChange={{this.pickSize}}
						aria-label="Size"
					/>
					<CanonRow
						@title="Size"
						@form="flush"
						as |id|
					>
						<CanonNumberField
							@value={{this.t.fontSize}}
							@min={{6}}
							@max={{400}}
							@unit="px"
							@labelledBy={{id}}
							@onChange={{this.setSize}}
						/>
					</CanonRow>
				</CanonRows>
			</PopoverCell>
			<MenuCell
				@label="Style"
				@text={{this.styleTitle}}
				@items={{this.styleItems}}
				@placement={{@placement}}
			/>
			<MenuCell
				@label="Align"
				@icon={{this.align.icon}}
				@items={{this.alignItems}}
				@placement={{@placement}}
			/>
		</Cells>
		<input
			type="file"
			accept=".woff2,.woff,.ttf,.otf"
			class="dt-sr-only"
			aria-label="Upload a custom font file"
			tabindex="-1"
			{{this.registerFile}}
			{{on "change" this.onFile}}
		/>
	</template>
}
