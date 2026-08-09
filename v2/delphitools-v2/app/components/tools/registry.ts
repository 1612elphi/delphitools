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
import AlgebraCalc from 'delphitools-v2/components/tools/algebra-calc';
import ArtworkEnhancer from 'delphitools-v2/components/tools/artwork-enhancer';
import BackgroundRemover from 'delphitools-v2/components/tools/background-remover';
import BaseConverter from 'delphitools-v2/components/tools/base-converter';
import Base64ImageEncoder from 'delphitools-v2/components/tools/base64-image-encoder';
import ColorblindSim from 'delphitools-v2/components/tools/colorblind-sim';
import ColourConverter from 'delphitools-v2/components/tools/colour-converter';
import ContrastChecker from 'delphitools-v2/components/tools/contrast-checker';
import Decoder from 'delphitools-v2/components/tools/decoder';
import Encoder from 'delphitools-v2/components/tools/encoder';
import FaviconGenny from 'delphitools-v2/components/tools/favicon-genny';
import FontExplorer from 'delphitools-v2/components/tools/font-explorer';
import GlyphBrowser from 'delphitools-v2/components/tools/glyph-browser';
import GradientGenny from 'delphitools-v2/components/tools/gradient-genny';
import HarmonyGenny from 'delphitools-v2/components/tools/harmony-genny';
import ImageClipper from 'delphitools-v2/components/tools/image-clipper';
import ImageSplitter from 'delphitools-v2/components/tools/image-splitter';
import LargeType from 'delphitools-v2/components/tools/large-type';
import LineHeightCalc from 'delphitools-v2/components/tools/line-height-calc';
import MarkdownWriter from 'delphitools-v2/components/tools/markdown-writer';
import MatteGenerator from 'delphitools-v2/components/tools/matte-generator';
import MetaTagGenny from 'delphitools-v2/components/tools/meta-tag-genny';
import PaletteCollection from 'delphitools-v2/components/tools/palette-collection';
import PaletteExtractor from 'delphitools-v2/components/tools/palette-extractor';
import PaletteGenny from 'delphitools-v2/components/tools/palette-genny';
import PaperSizes from 'delphitools-v2/components/tools/paper-sizes';
import PasteImage from 'delphitools-v2/components/tools/paste-image';
import PixelPicker from 'delphitools-v2/components/tools/pixel-picker';
import PlaceholderGenny from 'delphitools-v2/components/tools/placeholder-genny';
import PxToRem from 'delphitools-v2/components/tools/px-to-rem';
import RegexTester from 'delphitools-v2/components/tools/regex-tester';
import SciCalc from 'delphitools-v2/components/tools/sci-calc';
import ScrollGenerator from 'delphitools-v2/components/tools/scroll-generator';
import ShavianTransliterator from 'delphitools-v2/components/tools/shavian-transliterator';
import SvgOptimiser from 'delphitools-v2/components/tools/svg-optimiser';
import TailwindCheatsheet from 'delphitools-v2/components/tools/tailwind-cheatsheet';
import TailwindShades from 'delphitools-v2/components/tools/tailwind-shades';
import TextDiff from 'delphitools-v2/components/tools/text-diff';
import TimeCalc from 'delphitools-v2/components/tools/time-calc';
import TypoCalc from 'delphitools-v2/components/tools/typo-calc';
import UnitConverter from 'delphitools-v2/components/tools/unit-converter';
import Watermarker from 'delphitools-v2/components/tools/watermarker';
import WordCounter from 'delphitools-v2/components/tools/word-counter';

export const TOOL_COMPONENTS: Record<string, ComponentLike<object>> = {
	'algebra-calc': AlgebraCalc,
	'artwork-enhancer': ArtworkEnhancer,
	'background-remover': BackgroundRemover,
	'base-converter': BaseConverter,
	'base64-image-encoder': Base64ImageEncoder,
	'colorblind-sim': ColorblindSim,
	'colour-converter': ColourConverter,
	'contrast-checker': ContrastChecker,
	decoder: Decoder,
	encoder: Encoder,
	'favicon-genny': FaviconGenny,
	'font-explorer': FontExplorer,
	'glyph-browser': GlyphBrowser,
	'gradient-genny': GradientGenny,
	'harmony-genny': HarmonyGenny,
	'image-clipper': ImageClipper,
	'image-splitter': ImageSplitter,
	'large-type': LargeType,
	'line-height-calc': LineHeightCalc,
	'markdown-writer': MarkdownWriter,
	'matte-generator': MatteGenerator,
	'meta-tag-genny': MetaTagGenny,
	'palette-collection': PaletteCollection,
	'palette-extractor': PaletteExtractor,
	'palette-genny': PaletteGenny,
	'paper-sizes': PaperSizes,
	'paste-image': PasteImage,
	'pixel-picker': PixelPicker,
	'placeholder-genny': PlaceholderGenny,
	'px-to-rem': PxToRem,
	'regex-tester': RegexTester,
	'sci-calc': SciCalc,
	'scroll-generator': ScrollGenerator,
	'shavian-transliterator': ShavianTransliterator,
	'svg-optimiser': SvgOptimiser,
	'tailwind-cheatsheet': TailwindCheatsheet,
	'tailwind-shades': TailwindShades,
	'text-diff': TextDiff,
	'time-calc': TimeCalc,
	'typo-calc': TypoCalc,
	'unit-converter': UnitConverter,
	watermarker: Watermarker,
	'word-counter': WordCounter,
};
