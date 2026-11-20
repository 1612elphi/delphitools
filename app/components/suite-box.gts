import { LinkTo } from '@ember/routing';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import { patternStyle } from 'delphitools-v2/lib/icon-pattern';
import type { Suite } from 'delphitools-v2/lib/tools';
import './suite-box.css';

const RUN = [0, 1, 2, 3, 4, 5];
const COPIES = [0, 1];

const SuiteBox: TOC<{ Args: { suite: Suite } }> = <template>
	<LinkTo @route={{@suite.route}} class="dt-suite is-{{@suite.tool.id}}">
		<span class="dt-suite-band" aria-hidden="true">
			<span class="dt-suite-track">
				{{#each COPIES}}
					{{#each RUN}}
						<span>{{@suite.tagline}}</span>
						<Icon @name="sparkle" />
					{{/each}}
				{{/each}}
			</span>
		</span>

		<span class="dt-suite-face">
			<span
				class="dt-suite-pattern"
				style={{patternStyle @suite.tool.icon}}
				aria-hidden="true"
			></span>
			<span
				class="dt-suite-word"
				aria-hidden="true"
			>{{@suite.word}}</span>

			<span class="dt-suite-name">{{@suite.tool.name}}</span>
			<span
				class="dt-suite-desc"
			>{{@suite.tool.description}}</span>

			<span class="dt-suite-chips">
				{{#each @suite.features as |feature|}}
					<span
						class="dt-suite-chip"
					>{{feature}}</span>
				{{/each}}
			</span>
		</span>
	</LinkTo>
</template>;

export default SuiteBox;
