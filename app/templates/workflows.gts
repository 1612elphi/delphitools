import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import Icon from 'delphitools-v2/components/icon';
import WorkflowList from 'delphitools-v2/components/workflow-list';

const DESCRIPTION = 'Execute tool sequences';

export default RouteTemplate(
	<template>
		{{pageTitle "Workflows"}}

		<div class="dt-tool-page">
			<div class="dt-tool-body">
				<header class="dt-tool-header is-capped">
					<span class="dt-tool-icon">
						<Icon @name="workflow" />
					</span>
					<div class="dt-tool-heading">
						<div class="dt-tool-titles">
							<h1>Workflows</h1>
						</div>
						<p
							class="dt-tool-desc"
						>{{DESCRIPTION}}</p>
					</div>
				</header>

				<WorkflowList />
			</div>
		</div>
	</template>,
);
