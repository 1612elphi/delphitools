import type { TOC } from '@ember/component/template-only';

/**
 * verbatim from delphicomponents (public domain); styled in _nds-loader.scss;
 * size(4) default, is-stage=8px; @mode tokens: reverse thinking comet dot twin
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
