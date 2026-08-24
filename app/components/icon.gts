import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { icons } from 'delphitools-v2/lib/icons';

export interface IconSignature {
	Element: HTMLSpanElement;
	Args: {
		name: string;
	};
}

// css sets icon size
function markup(name: string) {
	return htmlSafe(icons[name] ?? '');
}

const Icon: TOC<IconSignature> = <template>
	<span class="dt-icon" aria-hidden="true" ...attributes>{{markup
			@name
		}}</span>
</template>;

export default Icon;
