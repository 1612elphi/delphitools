import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import ToolGrid from 'delphitools-v2/components/tool-grid';
import { experimentsCategory } from 'delphitools-v2/lib/tools';

const INTRO =
	"Experiments are even simpler, even smaller tools that don't fit anywhere else. They might get added or removed without warning. There's no guarantee that these do anything useful, or that they even work as intended.";

export default RouteTemplate(
	<template>
		{{pageTitle experimentsCategory.name}}

		<div class="dt-tool-page">
			<div class="dt-tool-body">
				<header class="dt-tool-header is-capped">
					<div class="dt-tool-heading">
						<h1 class="dt-exp-title">
							<img
								src="/art/experiments.webp"
								width="2000"
								height="920"
								alt={{experimentsCategory.name}}
								class="dt-exp-art"
							/>
						</h1>
						<p
							class="dt-tool-desc"
						>{{INTRO}}</p>
					</div>
				</header>

				<ToolGrid
					@tools={{experimentsCategory.tools}}
				/>
			</div>
		</div>
	</template>,
);
