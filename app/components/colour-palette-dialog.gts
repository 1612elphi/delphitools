import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import Icon from 'delphitools-v2/components/icon';
import {
	contrastText,
	rgbToCmyk,
	rgbToHex,
	rgbToHsl,
} from 'delphitools-v2/lib/colour-maths';
import './colour-palette-dialog.css';

const TOKENS = [
	'background',
	'foreground',
	'card',
	'popover',
	'primary',
	'secondary',
	'muted',
	'accent',
	'destructive',
	'border',
	'input',
	'ring',
	'chart-1',
	'chart-2',
	'chart-3',
	'chart-4',
	'chart-5',
	'sidebar',
	'sidebar-primary',
	'sidebar-accent',
];

const CMYK_NOTE = 'CMYK is natively converted and uses no ICC profile';

interface Entry {
	tokens: string[];
	name: string;
	hex: string;
	rgb: string;
	hsl: string;
	cmyk: string;
	oklch: string;
	swatch: ReturnType<typeof htmlSafe>;
}

function readPalette(nameOf: (hex: string) => string): Entry[] {
	const styles = getComputedStyle(document.documentElement);
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return [];

	const byHex = new Map<string, Entry>();
	for (const token of TOKENS) {
		const authored = styles.getPropertyValue(`--${token}`).trim();
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = authored;
		ctx.fillRect(0, 0, 1, 1);
		const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
		const hex = rgbToHex(r, g, b);

		const seen = byHex.get(hex);
		if (seen) {
			seen.tokens.push(token);
			continue;
		}
		const [h, sat, l] = rgbToHsl(r, g, b);
		const [c, m, y, k] = rgbToCmyk(r, g, b);
		byHex.set(hex, {
			tokens: [token],
			name: nameOf(hex),
			hex: hex.toUpperCase(),
			rgb: `${r}, ${g}, ${b}`,
			hsl: `${Math.round(h)}°, ${Math.round(sat)}%, ${Math.round(l)}%`,
			cmyk: `${c}, ${m}, ${y}, ${k}`,
			oklch: authored,
			swatch: htmlSafe(
				`background: ${hex}; color: ${contrastText(hex)}`,
			),
		});
	}
	return [...byHex.values()];
}

export default class ColourPaletteDialog extends Component {
	@tracked entries: Entry[] = [];
	@tracked isOpen = false;

	open = (event: Event) => {
		(event.currentTarget as HTMLElement).focus();
		this.isOpen = true;
		void this.load();
	};

	closed = () => {
		this.isOpen = false;
	};

	load = async () => {
		const { getColourName } =
			await import('delphitools-v2/lib/colour-names');
		this.entries = readPalette(getColourName);
	};

	copy = (value: string) => {
		void navigator.clipboard?.writeText(value);
	};

	<template>
		<button
			type="button"
			class="dt-palette-trigger"
			{{on "click" this.open}}
		>
			<Icon @name="swatch-book" />
			View colour palette
		</button>

		<CanonDialog
			class="dt-palette-dialog"
			@open={{this.isOpen}}
			@title="Colour palette"
			@onClose={{this.closed}}
		>
			<:default>

				<div class="dt-swatches">
					{{#each this.entries key="hex" as |e|}}
						<article class="dt-swatch">
							<div
								class="dt-swatch-chip"
								style={{e.swatch}}
							>
								<span
									class="dt-swatch-hex"
								>{{e.hex}}</span>
							</div>
							<div
								class="dt-swatch-meta"
							>
								<h3
								>{{e.name}}</h3>
								<div
									class="dt-swatch-tokens"
								>
									{{#each
										e.tokens
										key="."
										as |token|
									}}
										<code
										>--{{token}}</code>
									{{/each}}
								</div>
								<dl>
									<div>
										<dt
										>RGB</dt>
										<dd
										>{{e.rgb}}</dd>
									</div>
									<div>
										<dt
										>HSL</dt>
										<dd
										>{{e.hsl}}</dd>
									</div>
									<div>
										<dt
										>CMYK</dt>
										<dd
										>{{e.cmyk}}</dd>
									</div>
									<div>
										<dt
										>OKLCH</dt>
										<dd
										>{{e.oklch}}</dd>
									</div>
								</dl>
								<button
									type="button"
									class="dt-swatch-copy"
									{{on
										"click"
										(fn
											this.copy
											e.hex
										)
									}}
								>
									<Icon
										@name="copy"
									/>
									<span
										class="dt-sr-only"
									>Copy
										hex</span>
								</button>
							</div>
						</article>
					{{/each}}
				</div>

				<p class="dt-swatches-note">{{CMYK_NOTE}}</p>
			</:default>
			<:footer as |close|>
				<CanonButton
					@text="Close"
					@onClick={{fn close ""}}
				/>
			</:footer>
		</CanonDialog>
	</template>
}
