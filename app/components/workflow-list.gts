import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import Icon from 'delphitools-v2/components/icon';
import {
	WORKFLOWS,
	workflowInput,
	workflowTools,
	type Workflow,
} from 'delphitools-v2/lib/workflows';
import type FlowService from 'delphitools-v2/services/flow';

const ROWS = WORKFLOWS.map((workflow) => ({
	workflow,
	input: workflowInput(workflow),
	steps: workflowTools(workflow).map((tool, index) => ({
		n: index + 1,
		tool,
	})),
}));

/**
 * The catalogue of workflows, one flush row each: the name and what goes
 * in, the steps as the Flow State bar's tiles, a Start cell. A row starts
 * its flow.
 */
export default class WorkflowList extends Component<{
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
		<div class="dt-wf" ...attributes>
			{{#each ROWS key="workflow.id" as |row|}}
				<button
					type="button"
					class="dt-wf-row"
					{{on
						"click"
						(fn this.start row.workflow)
					}}
				>
					<span class="dt-wf-name">
						<span
						>{{row.workflow.name}}</span>
						{{#if row.input}}
							<span
								class="dt-wf-in"
							>{{row.input}}</span>
						{{/if}}
					</span>
					<span class="dt-wf-steps">
						{{#each
							row.steps key="n"
							as |step|
						}}
							<span
								class="dt-wf-step"
							>
								<span
									class="dt-flow-n"
								>{{step.n}}</span>
								<Icon
									@name={{step.tool.icon}}
								/>
								<span
								>{{step.tool.name}}</span>
							</span>
						{{/each}}
					</span>
					<span class="dt-wf-start">
						Start
						<Icon @name="arrow-right" />
					</span>
				</button>
			{{/each}}
		</div>
	</template>
}
