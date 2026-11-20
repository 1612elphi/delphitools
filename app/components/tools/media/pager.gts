import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonRows from 'delphicanon/components/canon-rows';
import { IconSvg } from 'delphitools-v2/components/icon';
import './pager.css';

export interface PagerSignature {
	Args: {
		page: number;
		count: number;
		onStep: (delta: number) => void;
		previous?: string;
		next?: string;
	};
	Element: HTMLDivElement;
}

const Back = <template><IconSvg @name="chevron-left" /></template>;
const Forward = <template><IconSvg @name="chevron-right" /></template>;

const reading = (page: number, count: number) =>
	count ? `${page + 1} / ${count}` : '—';
const atFirst = (page: number) => page <= 0;
const atLast = (page: number, count: number) => page >= count - 1;

const Pager: TOC<PagerSignature> = <template>
	<CanonRows @framed={{true}} ...attributes>
		<CanonGrid class="media-pager">
			<CanonButton
				class="media-pager-back"
				@icon={{Back}}
				@label={{if
					@previous
					@previous
					"Previous page"
				}}
				@disabled={{atFirst @page}}
				@onClick={{fn @onStep -1}}
			/>
			<output class="media-pager-text">{{reading
					@page
					@count
				}}</output>
			<CanonButton
				class="media-pager-forward"
				@icon={{Forward}}
				@label={{if @next @next "Next page"}}
				@disabled={{atLast @page @count}}
				@onClick={{fn @onStep 1}}
			/>
		</CanonGrid>
	</CanonRows>
</template>;

export default Pager;
