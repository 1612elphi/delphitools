import type { TOC } from '@ember/component/template-only';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import type { GlyphKind } from 'delphicanon/lib/glyph-rows';
import type { Pair } from 'delphitools-v2/components/tools/encoder/engine';

interface PairsSignature {
	Args: { pairs: Pair[]; label: string };
}

const face = 24;
const middle = 16;
const metrics = { height: face * 2 + middle, rowGap: 10, gap: 7 };

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

const measure = (pair: Pair) =>
	pair.newline
		? 0
		: Math.max(textWidth(pair.top), textWidth(pair.bottom));

const kind = (pair: Pair): GlyphKind => (pair.newline ? 'newline' : 'glyph');

const equals = (a: Pair, b: Pair) =>
	a.top === b.top && a.bottom === b.bottom && a.newline === b.newline;

const Pairs: TOC<PairsSignature> = <template>
	<div class="enc-pairs">
		<CanonGlyphFlow
			@glyphs={{@pairs}}
			@metrics={{metrics}}
			@measure={{measure}}
			@kind={{kind}}
			@equals={{equals}}
			@label={{@label}}
		>
			<:default as |pair|>
				{{#unless pair.newline}}
					<span
						class="enc-pair
							{{if
								pair.changes
								'enc-pair--changes'
							}}"
					>
						<span
							class="enc-pair-top"
						>{{pair.top}}</span>
						<span
							class="enc-pair-mark"
						></span>
						<span
							class="enc-pair-bottom"
						>{{pair.bottom}}</span>
					</span>
				{{/unless}}
			</:default>
			<:empty>
				<span class="enc-pairs-rule"></span>
				<span class="enc-pairs-rule"></span>
			</:empty>
		</CanonGlyphFlow>
	</div>
</template>;

export default Pairs;
