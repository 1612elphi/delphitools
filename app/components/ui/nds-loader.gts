import type { TOC } from '@ember/component/template-only';

/**
 * The NDS loader from delphicomponents (public domain), verbatim: a 3x3 grid
 * whose perimeter cells light in turn. Styled by app/styles/_nds-loader.scss;
 * A size(4) icon by default; `is-stage` is the
 * original 8px cell for stages and overlays. `@mode` takes the space-separated tokens the original documents:
 * reverse, thinking, comet, dot, twin.
 */
const NdsLoader: TOC<{
	Element: HTMLDivElement;
	Args: { mode?: string };
}> = <template>
	{{! template-lint-disable no-inline-styles }}
	<div
		class="nds-loader"
		data-mode={{@mode}}
		role="status"
		aria-label="Loading"
		...attributes
	>
		<span style="--i: 0"></span><span style="--i: 1"></span><span
			style="--i: 2"
		></span>
		<span style="--i: 7"></span><i></i><span style="--i: 3"></span>
		<span style="--i: 6"></span><span style="--i: 5"></span><span
			style="--i: 4"
		></span>
	</div>
</template>;

export default NdsLoader;
