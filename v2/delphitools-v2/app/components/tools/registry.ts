import type { ComponentLike } from '@glint/template';

/**
 * Tool id to component, mirroring the dynamic-import map in the Next app's
 * tools/[toolId]/page.tsx. Entries are added as tools are ported; an id with no
 * entry renders the placeholder.
 *
 * The imports are static rather than lazy for now. Ported tools pull in heavy
 * dependencies (pdf-lib, prosemirror, transformers.js), so this map is the
 * obvious place to split them out once there are enough to matter.
 * ponytail: static imports; make them async when the bundle warrants it.
 */
import ColourConverter from 'delphitools-v2/components/tools/colour-converter';
import FaviconGenny from 'delphitools-v2/components/tools/favicon-genny';
import PaletteGenny from 'delphitools-v2/components/tools/palette-genny';

export const TOOL_COMPONENTS: Record<string, ComponentLike<object>> = {
	'colour-converter': ColourConverter,
	'favicon-genny': FaviconGenny,
	'palette-genny': PaletteGenny,
};
