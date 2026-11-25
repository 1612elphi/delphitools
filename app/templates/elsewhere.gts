import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import Icon from 'delphitools-v2/components/icon';
import ElsewhereAppCard from 'delphitools-v2/components/elsewhere-app';
// marquee keyframes
import 'delphitools-v2/components/suite-box.css';
import { elsewhereGroups } from 'delphitools-v2/lib/tools';

// two copies of the run make the -50% loop
const RUN = [0, 1, 2, 3, 4, 5, 6, 7];

export default RouteTemplate(
	<template>
		{{pageTitle "Elsewhere"}}

		<div class="dt-tool-page">
			<div class="dt-tool-body">
				<header class="dt-else-head">
					<h1 class="dt-else-marquee">
						<span
							class="dt-sr-only"
						>delphitools elsewhere</span>
						<span
							class="dt-else-track"
							aria-hidden="true"
						>
							{{#each RUN}}
								<span
								>delphitools
									elsewhere</span>
								<Icon
									@name="sparkle"
								/>
							{{/each}}
						</span>
					</h1>
					<p class="dt-else-marquee is-small">
						<span class="dt-sr-only">Many
							platforms, maybe yours
							too</span>
						<span
							class="dt-else-track"
							aria-hidden="true"
						>
							{{#each RUN}}
								<span>Many
									platforms</span>
								<Icon
									@name="sparkle"
								/>
								<span>Maybe
									yours
									too</span>
								<Icon
									@name="sparkle"
								/>
							{{/each}}
						</span>
					</p>
				</header>

				{{#each elsewhereGroups as |group|}}
					<section class="dt-else-group">
						{{#if group.name}}
							<h2
								class="dt-else-heading"
							>{{group.name}}</h2>
						{{/if}}
						<div class="dt-else-list">
							{{#each
								group.apps
								as |app|
							}}
								<ElsewhereAppCard
									@app={{app}}
								/>
							{{/each}}
							{{#if group.kits}}
								<div
									class="dt-else dt-else-kits"
								>
									<h2
										class="dt-else-heading"
									>Built
										with</h2>
									<ul>
										{{#each
											group.kits
											as |kit|
										}}
											<li
											>{{kit}}</li>
										{{/each}}
									</ul>
								</div>
							{{/if}}
						</div>
					</section>
				{{/each}}
			</div>
		</div>
	</template>,
);
