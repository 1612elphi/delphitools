import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { LinkTo } from '@ember/routing';
import { service } from '@ember/service';
import { eq, not } from 'ember-truth-helpers';
import type { ComponentLike } from '@glint/template';
import CanonMenu, {
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import Icon, { IconSvg } from 'delphitools-v2/components/icon';
import {
	ORDINALS,
	SLOTS,
	START_TOOLS,
	WORKFLOWS,
	customWorkflow,
	nextTools,
	stepsPath,
	workflowCategory,
	workflowTools,
	type Workflow,
} from 'delphitools-v2/lib/workflows';
import { getToolById, type Tool } from 'delphitools-v2/lib/tools';
import type FlowService from 'delphitools-v2/services/flow';
import './workflow-list.css';

type PickItem = CanonMenuItem & { id: string };

const toolIcons = new Map<string, ComponentLike>();

function toolIcon(name: string): ComponentLike {
	let icon = toolIcons.get(name);
	if (!icon) {
		icon = <template><IconSvg @name={{name}} /></template>;
		toolIcons.set(name, icon);
	}
	return icon;
}

function focusCurrent(event: ToggleEvent) {
	if (event.newState !== 'open') return;
	(event.target as HTMLElement)
		.querySelector<HTMLElement>('[aria-checked="true"]')
		?.focus({ preventScroll: true });
}

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

export default class WorkflowList extends Component<{
	Element: HTMLDivElement;
}> {
	@service declare flow: FlowService;

	@tracked picks: string[] = [];

	get slots() {
		const chosen = this.picks.map((id) => getToolById(id) ?? null);
		return Array.from({ length: SLOTS }, (_, index) => {
			const before = chosen[index - 1];
			return {
				index,
				ordinal: ORDINALS[index],
				tool: chosen[index] ?? null,
				items: (index === 0
					? START_TOOLS
					: before
						? nextTools(before)
						: []
				).map((tool): PickItem => ({
					id: tool.id,
					title: tool.name,
					kind: 'radio',
					checked: tool.id === this.picks[index],
					icon: toolIcon(tool.icon),
				})),
			};
		});
	}

	@cached
	get custom() {
		return customWorkflow(this.picks);
	}

	get stepsPath() {
		return stepsPath(this.picks);
	}

	pick = (index: number, item: CanonMenuItem) => {
		this.picks = [
			...this.picks.slice(0, index),
			(item as PickItem).id,
		];
	};

	start = (workflow: Workflow) => void this.flow.start(workflow);

	startCustom = () => {
		if (this.custom) this.start(this.custom);
	};

	<template>
		<div class="dt-wf-list" ...attributes>
			<img
				src="/art/delphi-alien.webp"
				width="815"
				height="1568"
				alt=""
				class="dt-wf-art"
			/>
			<div class="dt-wf-scroll">
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
							>Finally,</th>
							<th
								scope="col"
								class="dt-wf-th"
							></th>
						</tr>
					</thead>
					<tbody>
						<tr
							class="dt-wf-row dt-wf-custom"
						>
							<th
								scope="row"
								class="dt-wf-cell"
							>
								<div
									class="dt-wf-name dt-wf-custom-name"
								>
									<span
										class="dt-wf-custom-title"
									>
										<span
										>Custom</span>
										<span
											class="dt-wf-in"
										>Build
											your
											own</span>
									</span>
									{{#if
										this.custom
									}}
										<LinkTo
											@route="workflow"
											@model={{this.stepsPath}}
											class="dt-icon-btn dt-wf-link"
											title="Share link"
											aria-label="Share link"
										>
											<Icon
												@name="link"
											/>
										</LinkTo>
									{{/if}}
								</div>
							</th>
							{{#each
								this.slots
								key="index"
								as |slot|
							}}
								<td
									class="dt-wf-cell dt-wf-pick"
								>
									<CanonMenu
										class="dt-wf-pick-list"
										@items={{slot.items}}
										@onSelect={{fn
											this.pick
											slot.index
										}}
										{{on
											"toggle"
											focusCurrent
										}}
										as |menu|
									>
										<button
											type="button"
											class="dt-wf-pick-trigger"
											disabled={{eq
												slot.items.length
												0
											}}
											{{menu.trigger}}
										>
											{{#if
												slot.tool
											}}
												<Icon
													@name={{slot.tool.icon}}
												/>
												<span
													class="dt-wf-pick-value"
												>{{slot.tool.name}}</span>
											{{else}}
												<span
													class="dt-wf-pick-value dt-wf-pick-placeholder"
												>{{slot.ordinal}}</span>
											{{/if}}
											<Icon
												@name="chevron-down"
												class="dt-wf-pick-chevron"
											/>
										</button>
									</CanonMenu>
								</td>
							{{/each}}
							<td class="dt-wf-cell">
								<button
									type="button"
									class="dt-wf-go"
									disabled={{not
										this.custom
									}}
									{{on
										"click"
										this.startCustom
									}}
								>
									Start
									<Icon
										@name="arrow-right"
									/>
								</button>
							</td>
						</tr>
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
								<td
									class="dt-wf-cell"
								>
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
		</div>
	</template>
}
