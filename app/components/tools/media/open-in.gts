import type { TOC } from '@ember/component/template-only';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import AtlasOpenIn from 'delphitools-v2/components/atlas-open-in';
import type { Tool } from 'delphitools-v2/lib/tools';
import './open-in.css';

const OpenIn: TOC<{
	Args: {
		file?: File | null;
		self?: string;
		tools?: Pick<Tool, 'id' | 'name' | 'icon'>[];
		query?: Record<string, string>;
	};
	Element: HTMLDivElement;
}> = <template>
	<CanonRows class="media-open" @framed={{true}} ...attributes>
		<CanonHeading @text="Open in" />
		<AtlasOpenIn
			@file={{@file}}
			@self={{@self}}
			@tools={{@tools}}
			@query={{@query}}
		/>
	</CanonRows>
</template>;

export default OpenIn;
