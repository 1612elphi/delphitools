import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import WorkflowGrid from 'delphitools-v2/components/workflow-grid';

export default RouteTemplate(
	<template>
		{{pageTitle "Workflows"}}

		<div class="dt-page">
			<section class="dt-section">
				<h2 class="dt-section-title">Workflows</h2>
				<WorkflowGrid />
			</section>
		</div>
	</template>,
);
