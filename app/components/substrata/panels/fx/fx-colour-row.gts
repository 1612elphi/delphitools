import type { TOC } from '@ember/component/template-only';
import CanonRow from 'delphicanon/components/canon-row';
import FxColourWell from './fx-colour-well';
import { labelOf, type FxContext } from './fx-context';

const FxColourRow: TOC<{ Args: { ctx: FxContext; key: string } }> = <template>
	<CanonRow
		class="sub-fxp-row"
		@title={{labelOf @ctx @key}}
		@form="flush"
		data-fx-param={{@key}}
	>
		<FxColourWell
			@ctx={{@ctx}}
			@key={{@key}}
			@label={{labelOf @ctx @key}}
		/>
	</CanonRow>
</template>;

export default FxColourRow;
