import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import { hex, type Rgb } from 'delphicanon/lib/colour';
import type { contrastRows } from 'delphitools-v2/components/tools/colour-atlas/atlas';

const ink = (colour: Rgb) => htmlSafe(`color: ${hex(colour)}`);

interface ContrastRowSignature {
	Args: {
		colour: Rgb;
		row: ReturnType<typeof contrastRows>[number];
	};
}

const ContrastRow: TOC<ContrastRowSignature> = <template>
	<div class="colour-atlas-contrast">
		<span
			class="colour-atlas-contrast-chip
				{{if
					@row.white
					'colour-atlas-contrast-chip--white'
				}}"
			style={{ink @colour}}
			aria-hidden="true"
		>Aa</span>
		<span class="colour-atlas-contrast-cell">
			<span class="colour-atlas-contrast-text">
				<span
					class="colour-atlas-contrast-ratio"
				>{{@row.ratio}}</span>
				<span
					class="colour-atlas-contrast-against"
				>{{@row.against}}</span>
			</span>
			<span
				class="colour-atlas-contrast-lamps"
				aria-hidden="true"
			>
				{{#each @row.lamps as |lamp|}}
					<span
						class="colour-atlas-contrast-lamp
							{{if
								lamp.on
								'colour-atlas-contrast-lamp--on'
							}}"
					>{{lamp.label}}</span>
				{{/each}}
			</span>
			<span class="colour-atlas-hidden">{{@row.passed}}</span>
		</span>
	</div>
</template>;

export default ContrastRow;
