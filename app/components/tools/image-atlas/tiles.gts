import type { TOC } from '@ember/component/template-only';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	tileSplit,
	type Row,
} from 'delphitools-v2/components/tools/image-atlas/report';

const Tiles: TOC<{ Args: { rows: Row[] } }> = <template>
	{{#let (tileSplit @rows) as |split|}}
		{{#if split.short.length}}
			<CanonTiles @items={{split.short}} />
		{{/if}}
		{{#each split.long as |row|}}
			<CanonValueLine
				@label={{row.label}}
				@value={{row.value}}
				@layout="above"
			/>
		{{/each}}
	{{/let}}
</template>;

export default Tiles;
