import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import Icon from 'delphitools-v2/components/icon';
import {
	WORKFLOWS,
	workflowTools,
	type Workflow,
} from 'delphitools-v2/lib/workflows';
import type FlowService from 'delphitools-v2/services/flow';

const ROWS = WORKFLOWS.map((workflow) => ({
	workflow,
	tools: workflowTools(workflow),
}));

/** The catalogue of workflows; a cell starts its flow. */
export default class WorkflowGrid extends Component<{
	Element: HTMLDivElement;
}> {
	@service declare flow: FlowService;

	/** starting over drops the running flow's captures; ask first */
	start = (workflow: Workflow) => {
		const { flow } = this;
		if (
			flow.active &&
			flow.files.length > 0 &&
			!confirm('Discard captures?')
		)
			return;
		void flow.start(workflow);
	};

	<template>
		<div class="dt-grid" ...attributes>
			{{#each ROWS key="workflow.id" as |row|}}
				<button
					type="button"
					class="dt-cell dt-flow-cell"
					{{on
						"click"
						(fn this.start row.workflow)
					}}
				>
					<Icon
						@name="workflow"
						class="dt-cell-icon"
					/>
					<span
						class="dt-cell-name"
					>{{row.workflow.name}}</span>
					<span
						class="dt-cell-desc dt-flow-chain"
					>
						{{#each
							row.tools
							as |tool index|
						}}
							{{#if index}}
								<Icon
									@name="arrow-right"
								/>
							{{/if}}
							<Icon
								@name={{tool.icon}}
							/>
							<span
							>{{tool.name}}</span>
						{{/each}}
					</span>
				</button>
			{{/each}}
		</div>
	</template>
}
