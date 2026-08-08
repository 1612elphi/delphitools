import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import { icons } from 'delphitools-v2/lib/icons';

export interface IconSignature {
  Element: HTMLSpanElement;
  Args: {
    /** kebab-case lucide name, e.g. "qr-code"; see app/lib/icons.ts */
    name: string;
  };
}

// lucide-static bakes width/height 24 into every icon. Stripping them lets the
// wrapper's size drive the box, so `size-*` on <Icon> is what sizes it.
const SIZE_ATTRS = /\s(?:width|height)="24"/g;

function markup(name: string) {
  const svg = icons[name];
  return htmlSafe(svg ? svg.replace(SIZE_ATTRS, '') : '');
}

const Icon: TOC<IconSignature> = <template>
  <span class="dt-icon" aria-hidden="true" ...attributes>{{markup @name}}</span>
</template>;

export default Icon;
