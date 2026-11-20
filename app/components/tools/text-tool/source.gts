import type { TOC } from '@ember/component/template-only';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonTextArea from 'delphicanon/components/canon-text-area';
import PasteClear from 'delphitools-v2/components/tools/text-tool/paste-clear';
import './text-tool.css';

interface SourceSignature {
	Args: {
		heading: string;
		text: string;
		label?: string;
		onChange: (text: string) => void;
	};
	Blocks: { default: [] };
}

const Source: TOC<SourceSignature> = <template>
	<CanonHeading @text={{@heading}} />
	<CanonTextArea
		class="tt-source"
		@value={{@text}}
		@placeholder="Type or paste"
		@onChange={{@onChange}}
		aria-label={{if @label @label "Input"}}
	/>
	<CanonGrid>
		<PasteClear @text={{@text}} @onChange={{@onChange}} />
		{{yield}}
	</CanonGrid>
</template>;

export default Source;
