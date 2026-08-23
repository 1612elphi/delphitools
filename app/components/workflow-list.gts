import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import Icon from 'delphitools-v2/components/icon';
import {
	SLOTS,
	WORKFLOWS,
	workflowCategory,
	workflowTools,
	type Workflow,
} from 'delphitools-v2/lib/workflows';
import type { Tool } from 'delphitools-v2/lib/tools';
import type FlowService from 'delphitools-v2/services/flow';

const ROWS = WORKFLOWS.map((workflow) => {
	const tools = workflowTools(workflow);
	return {
		workflow,
		category: workflowCategory(workflow),
		slots: Array.from(
			{ length: SLOTS },
			(_, index): Tool | null => tools[index] ?? null,
		),
	};
});

/**
 * The catalogue of workflows as a table: the name and category in the
 * first column, one column per step slot so the tools line up by
 * position, Start at the end. The name and Start both start the flow.
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
		<div class="dt-wf-scroll" ...attributes>
			<table class="dt-wf">
				<thead>
					<tr>
						<th
							scope="col"
							class="dt-wf-th"
						>Workflow</th>
						<th
							scope="col"
							class="dt-wf-th"
						>First,</th>
						<th
							scope="col"
							class="dt-wf-th"
						>Then...</th>
						<th
							scope="col"
							class="dt-wf-th"
						>After,</th>
						<th
							scope="col"
							class="dt-wf-th"
						>Finally,</th>
						<th
							scope="col"
							class="dt-wf-th"
						></th>
					</tr>
				</thead>
				<tbody>
					{{#each
						ROWS key="workflow.id"
						as |row|
					}}
						<tr class="dt-wf-row">
							<th
								scope="row"
								class="dt-wf-cell"
							>
								<button
									type="button"
									class="dt-wf-name"
									{{on
										"click"
										(fn
											this.start
											row.workflow
										)
									}}
								>
									<span
									>{{row.workflow.name}}</span>
									<span
										class="dt-wf-in"
									>{{row.category}}</span>
								</button>
							</th>
							{{#each
								row.slots
								as |tool|
							}}
								<td
									class="dt-wf-cell dt-wf-step"
								>
									{{#if
										tool
									}}
										<Icon
											@name={{tool.icon}}
										/>
										<span
										>{{tool.name}}</span>
									{{/if}}
								</td>
							{{/each}}
							<td class="dt-wf-cell">
								<button
									type="button"
									class="dt-wf-go"
									{{on
										"click"
										(fn
											this.start
											row.workflow
										)
									}}
								>
									Start
									<Icon
										@name="arrow-right"
									/>
								</button>
							</td>
						</tr>
					{{/each}}
				</tbody>
			</table>
		</div>
	</template>
}
