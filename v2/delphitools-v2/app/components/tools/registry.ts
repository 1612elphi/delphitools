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
import BackgroundRemover from 'delphitools-v2/components/tools/background-remover';
import ColorblindSim from 'delphitools-v2/components/tools/colorblind-sim';
import ColourConverter from 'delphitools-v2/components/tools/colour-converter';
import ContrastChecker from 'delphitools-v2/components/tools/contrast-checker';
import FaviconGenny from 'delphitools-v2/components/tools/favicon-genny';
import GradientGenny from 'delphitools-v2/components/tools/gradient-genny';
import HarmonyGenny from 'delphitools-v2/components/tools/harmony-genny';
import PaletteCollection from 'delphitools-v2/components/tools/palette-collection';
import PaletteExtractor from 'delphitools-v2/components/tools/palette-extractor';
import PaletteGenny from 'delphitools-v2/components/tools/palette-genny';
import PixelPicker from 'delphitools-v2/components/tools/pixel-picker';
import TailwindShades from 'delphitools-v2/components/tools/tailwind-shades';

export const TOOL_COMPONENTS: Record<string, ComponentLike<object>> = {
	'background-remover': BackgroundRemover,
	'colorblind-sim': ColorblindSim,
	'colour-converter': ColourConverter,
	'contrast-checker': ContrastChecker,
	'favicon-genny': FaviconGenny,
	'gradient-genny': GradientGenny,
	'harmony-genny': HarmonyGenny,
	'palette-collection': PaletteCollection,
	'palette-extractor': PaletteExtractor,
	'palette-genny': PaletteGenny,
	'pixel-picker': PixelPicker,
	'tailwind-shades': TailwindShades,
};
