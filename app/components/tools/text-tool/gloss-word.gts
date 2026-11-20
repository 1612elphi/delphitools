import { modifier } from 'ember-modifier';
import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { Sound } from 'delphitools-v2/components/tools/text-tool/gloss-pieces';
import GlossLetter, {
	type LetterEdits,
} from 'delphitools-v2/components/tools/text-tool/gloss-letter';

export interface WordLetter {
	key: string;
	sound: Sound;
	alternatives: Sound[];
	edits: LetterEdits;
}

interface GlossWordSignature {
	Args: {
		latin: string;
		detail: string;
		letters: WordLetter[];
		alphabet: (Sound | null)[];
		onClose: () => void;
	};
	Blocks: { default: [] };
}

const CloseIcon = <template><IconSvg @name="x" /></template>;

const reveal = modifier((block: HTMLElement) => {
	block.scrollIntoView({ block: 'nearest' });
});

const GlossWord: TOC<GlossWordSignature> = <template>
	<CanonRows class="gl-word-block" @framed={{true}} {{reveal}}>
		<CanonHeading @text="Word" />
		<CanonRow
			class="gl-word-row"
			@title={{@latin}}
			@detail={{@detail}}
			@form="flush"
		>
			<CanonButton
				@kind="cell"
				@icon={{CloseIcon}}
				@label="Close"
				@onClick={{@onClose}}
			/>
		</CanonRow>
		<CanonGrid class="gl-letters" @columns={{5}}>
			{{#each @letters key="key" as |letter|}}
				<GlossLetter
					@sound={{letter.sound}}
					@alternatives={{letter.alternatives}}
					@alphabet={{@alphabet}}
					@edits={{letter.edits}}
				/>
			{{/each}}
		</CanonGrid>
		{{yield}}
	</CanonRows>
</template>;

export default GlossWord;
