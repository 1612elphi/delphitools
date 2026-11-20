import type { TOC } from '@ember/component/template-only';
import { fn, hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { LinkTo } from '@ember/routing';
import type { SafeString } from '@ember/template';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonFigure from 'delphicanon/components/canon-figure';
import { IconSvg } from 'delphitools-v2/components/icon';

export interface Swatch {
	key: string;
	hex: string;
	name: string;
	value: string;
	share: number;
	percent: string;
	figure: string;
	fill: SafeString;
	segment: SafeString;
	delay: SafeString;
}

interface Signature {
	Args: { swatches: Swatch[]; onCopy: (value: string) => void };
}

export const ShareBand: TOC<Signature> = <template>
	<div class="pe-band">
		{{#each @swatches key="@index" as |swatch|}}
			<button
				type="button"
				class="pe-band-segment"
				style={{swatch.segment}}
				aria-label="{{swatch.name}} {{swatch.percent}}"
				{{on "click" (fn @onCopy swatch.value)}}
			><span
					class="pe-band-percent"
				>{{swatch.percent}}</span></button>
		{{/each}}
	</div>
</template>;

export const ShareRows: TOC<Signature> = <template>
	{{#each @swatches key="key" as |swatch|}}
		<div class="pe-row" style={{swatch.delay}}>
			<button
				type="button"
				class="pe-row-copy"
				aria-label="{{swatch.name}} {{swatch.value}}"
				{{on "click" (fn @onCopy swatch.value)}}
			>
				<span
					class="pe-row-swatch"
					style={{swatch.fill}}
				></span>
				<span class="pe-row-cell">
					<span class="pe-row-text">
						<span
							class="pe-row-name"
						>{{swatch.name}}</span>
						<span
							class="pe-row-value"
						>{{swatch.value}}</span>
					</span>
					<CanonFigure
						class="pe-row-share"
						@text={{swatch.figure}}
						@unit="%"
						@size={{22}}
						@colour="var(--canon-foreground)"
					/>
					<CanonBar
						class="pe-row-bar"
						@share={{swatch.share}}
						@track="transparent"
					/>
				</span>
			</button>
			<LinkTo
				@route="tools.tool"
				@model="tailwind-shades"
				@query={{hash color=swatch.hex}}
				class="pe-row-shades"
				title="Generate Tailwind shades"
				aria-label="Generate Tailwind shades"
			><IconSvg @name="wind" /></LinkTo>
		</div>
	{{/each}}
</template>;

export const ShareStrip: TOC<Signature> = <template>
	<div class="pe-strip">
		{{#each @swatches key="@index" as |swatch|}}
			<button
				type="button"
				class="pe-strip-swatch"
				style={{swatch.fill}}
				aria-label="{{swatch.name}} {{swatch.value}}"
				{{on "click" (fn @onCopy swatch.value)}}
			></button>
		{{/each}}
	</div>
</template>;
