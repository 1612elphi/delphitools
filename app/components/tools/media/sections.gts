import type { TOC } from '@ember/component/template-only';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonTiles from 'delphicanon/components/canon-tiles';
import type { Section } from 'delphitools-v2/lib/mediainfo';

const Sections: TOC<{
	Args: { sections: Section[] };
	Element: HTMLDivElement;
}> = <template>
	{{#if @sections.length}}
		<CanonRows
			class="media-sections"
			@framed={{true}}
			...attributes
		>
			{{#each @sections as |section|}}
				<CanonHeading @text={{section.title}} />
				<CanonTiles @items={{section.rows}} />
			{{/each}}
		</CanonRows>
	{{/if}}
</template>;

export default Sections;
