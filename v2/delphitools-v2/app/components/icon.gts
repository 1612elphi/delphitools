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

// `.dt-icon svg { width: 100%; height: 100% }` in app.scss beats lucide-static's
// baked-in width/height presentation attributes, so the wrapper sizes the icon
// and the attributes need no stripping.
function markup(name: string) {
  return htmlSafe(icons[name] ?? '');
}

const Icon: TOC<IconSignature> = <template>
  <span class="dt-icon" aria-hidden="true" ...attributes>{{markup @name}}</span>
</template>;

export default Icon;
