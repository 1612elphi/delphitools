import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import { share } from 'delphitools-v2/components/tools/media/trim-span';
import './marks.css';

const at = (seconds: number, duration: number) =>
	htmlSafe(`inset-inline-start: ${share(seconds, duration) * 100}%`);

const Marks: TOC<{
	Args: { lit?: number[]; dim?: number[]; duration: number };
	Element: HTMLDivElement;
}> = <template>
	{{#if @duration}}
		<div class="media-marks" aria-hidden="true" ...attributes>
			{{#each @dim as |seconds|}}
				<span
					class="media-mark media-mark--dim"
					style={{at seconds @duration}}
				></span>
			{{/each}}
			{{#each @lit as |seconds|}}
				<span
					class="media-mark media-mark--lit"
					style={{at seconds @duration}}
				></span>
			{{/each}}
		</div>
	{{/if}}
</template>;

export default Marks;
