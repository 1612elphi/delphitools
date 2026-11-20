import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import type { Face, Pair } from 'delphitools-v2/components/tools/decoder/scene';

interface PairsSignature {
	Args: { pairs: Pair[]; label: string };
}

const face = 24;
const middle = 16;
const metrics = { height: face * 2 + middle, rowGap: 10, gap: 7 };
const morseUnit = 3;
const baconCell = 7;

let context: CanvasRenderingContext2D | null | undefined;
let family: string | undefined;
const widths = new Map<string, number>();

function textWidth(text: string) {
	const known = widths.get(text);
	if (known !== undefined) return known;
	context ??= document.createElement('canvas').getContext('2d');
	family ??= getComputedStyle(document.documentElement)
		.getPropertyValue('--canon-mono-font')
		.trim();
	if (!context) return text.length * 9;
	context.font = `600 17px ${family || 'monospace'}`;
	const width = Math.ceil(context.measureText(text).width);
	widths.set(text, width);
	return width;
}

const morseUnits = (code: string) =>
	code
		? Array.from(code).reduce(
				(sum, s) => sum + (s === '-' ? 3 : 1),
				0,
			) +
			code.length -
			1
		: 1;

function faceWidth(of: Face) {
	if (of.kind === 'morse') return morseUnits(of.value) * morseUnit;
	if (of.kind === 'bacon') return of.value.length * (baconCell + 1) - 1;
	return textWidth(of.value);
}

function measure(pair: Pair) {
	if (pair.kind === 'newline') return 0;
	if (pair.kind === 'space') return 6;
	return Math.max(
		faceWidth(pair.top),
		faceWidth(pair.bottom),
		pair.key ? 13 : 0,
	);
}

const kind = (pair: Pair) => pair.kind;

const sameFace = (a: Face, b: Face) => a.kind === b.kind && a.value === b.value;

const equals = (a: Pair, b: Pair) =>
	a.kind === b.kind &&
	a.changes === b.changes &&
	a.key === b.key &&
	sameFace(a.top, b.top) &&
	sameFace(a.bottom, b.bottom);

const marks = (code: string) => Array.from(code);

const FaceView: TOC<{ Args: { face: Face } }> = <template>
	{{#if (eq @face.kind "morse")}}
		<span class="dec-morse">
			{{#each (marks @face.value) as |mark|}}
				<span
					class="dec-morse-mark
						{{if
							(eq mark '-')
							'dec-morse-mark--dash'
						}}"
				></span>
			{{/each}}
		</span>
	{{else if (eq @face.kind "bacon")}}
		<span class="dec-bacon">
			{{#each (marks @face.value) as |cell|}}
				<span
					class="dec-bacon-cell
						{{if
							(eq cell 'B')
							'dec-bacon-cell--b'
						}}"
				></span>
			{{/each}}
		</span>
	{{else}}
		<span class="dec-face">{{@face.value}}</span>
	{{/if}}
</template>;

const Pairs: TOC<PairsSignature> = <template>
	<div class="dec-layer">
		<CanonGlyphFlow
			class="dec-pairs"
			@glyphs={{@pairs}}
			@metrics={{metrics}}
			@measure={{measure}}
			@kind={{kind}}
			@equals={{equals}}
			@label={{@label}}
		>
			<:default as |pair|>
				{{#if (eq pair.kind "glyph")}}
					<span
						class="dec-pair
							{{if
								pair.changes
								'dec-pair--changes'
							}}"
					>
						<span
							class="dec-pair-top"
						><FaceView
								@face={{pair.top}}
							/></span>
						{{#if pair.key}}
							<span
								class="dec-pair-key"
							>{{pair.key}}</span>
						{{else}}
							<span
								class="dec-pair-mark"
							></span>
						{{/if}}
						<span
							class="dec-pair-bottom"
						><FaceView
								@face={{pair.bottom}}
							/></span>
					</span>
				{{/if}}
			</:default>
			<:empty>
				<span class="dec-pairs-rule"></span>
				<span class="dec-pairs-rule"></span>
			</:empty>
		</CanonGlyphFlow>
	</div>
</template>;

export default Pairs;
