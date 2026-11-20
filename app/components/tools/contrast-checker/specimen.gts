import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import CanonFigure from 'delphicanon/components/canon-figure';
import { contrastFigure, hex, type Rgb } from 'delphicanon/lib/colour';
import { IconSvg } from 'delphitools-v2/components/icon';

export const specimenHeight = 276;

const lines = [
	{ text: 'Large', size: 'large', note: '18 pt' },
	{ text: 'Bold', size: 'bold', note: '14 pt' },
	{ text: 'Normal', size: 'normal', note: '12 pt' },
	{ text: 'Aa Bb Cc Dd Ee Ff Gg 0123456789', size: 'normal', note: '' },
];

const symbols = [
	{ icon: 'square-check' },
	{ icon: 'circle-dot' },
	{ icon: 'toggle-right' },
	{ icon: 'star' },
	{ icon: 'search' },
	{ icon: 'bell' },
];

function style(foreground: Rgb, background: Rgb) {
	return htmlSafe(
		`--contrast-ink: ${hex(foreground)}; --contrast-ground: ${hex(background)}`,
	);
}

interface SpecimenSignature {
	Args: {
		foreground: Rgb;
		background: Rgb;
		ratio: number;
		animated: boolean;
	};
}

const Specimen: TOC<SpecimenSignature> = <template>
	<div
		class="contrast-specimen"
		role="group"
		aria-label="Preview"
		style={{style @foreground @background}}
	>
		<div class="contrast-specimen-columns">
			<CanonFigure
				class="contrast-specimen-figure"
				@text={{contrastFigure @ratio}}
				@unit=":1"
				@size={{56}}
				@colour={{hex @foreground}}
				@animated={{@animated}}
			/>
			<div class="contrast-specimen-type">
				{{#each lines as |line|}}
					<div class="contrast-specimen-line">
						<span
							class="contrast-specimen-text contrast-specimen--{{line.size}}"
						>{{line.text}}</span>
						<span
							class="contrast-specimen-note"
						>{{line.note}}</span>
					</div>
				{{/each}}
				<div
					class="contrast-specimen-line contrast-specimen-controls"
				>
					<span
						class="contrast-specimen-symbols"
						aria-hidden="true"
					>
						{{#each symbols as |symbol|}}
							<span
								class="contrast-specimen-symbol"
							><IconSvg
									@name={{symbol.icon}}
								/></span>
						{{/each}}
					</span>
					<span
						class="contrast-specimen-note"
					>Controls</span>
				</div>
			</div>
		</div>
	</div>
</template>;

export default Specimen;
