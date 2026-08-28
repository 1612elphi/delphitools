import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { saveBlob } from 'delphitools-v2/lib/download';
import { reducedMotion } from 'delphitools-v2/lib/flow-hooks';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import type { FlowFile } from 'delphitools-v2/lib/flow-store';
import type { Tool } from 'delphitools-v2/lib/tools';
import type FlowService from 'delphitools-v2/services/flow';

interface Step {
	index: number;
	n: number;
	tool: Tool;
	done: boolean;
	current: boolean;
	future: boolean;
}

const FLIGHT_MS = 520;
const LANDING_MS = 160;
const ARC_RISE = 72;
const ARC_SAMPLES = 24;
const LIFT_OFF = 0.25;

async function flyTo(
	origin: DOMRect | null,
	target: HTMLElement,
): Promise<void> {
	if (!origin || reducedMotion()) return;
	const to = target.getBoundingClientRect();
	const x0 = origin.left + origin.width / 2;
	const y0 = origin.top + origin.height / 2;
	const x1 = to.left + to.width / 2;
	const y1 = to.top + to.height / 2;
	const cx = x0;
	const cy = y1 - ARC_RISE;
	const ghost = document.createElement('span');
	ghost.className = 'dt-flow-ghost';
	ghost.setAttribute('aria-hidden', 'true');
	ghost.style.left = `${x0}px`;
	ghost.style.top = `${y0}px`;
	document.body.append(ghost);
	const keyframes = Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => {
		const t = i / ARC_SAMPLES;
		const u = 1 - t;
		const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
		const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
		return {
			translate: `${x - x0}px ${y - y0}px`,
			scale: `${1 - 0.5 * t}`,
			opacity: 1 - 0.2 * t,
		};
	});
	try {
		await ghost
			.animate(keyframes, {
				duration: FLIGHT_MS,
				easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
				fill: 'forwards',
			})
			.finished.catch(() => undefined);
	} finally {
		ghost.remove();
	}
	await target
		.animate([{ scale: '1' }, { scale: '1.06' }, { scale: '1' }], {
			duration: LANDING_MS,
			easing: 'ease-out',
		})
		.finished.catch(() => undefined);
}

export default class FlowState extends Component {
	@service declare flow: FlowService;

	get name() {
		return this.flow.workflow?.name ?? '';
	}

	get steps(): Step[] {
		const current = this.flow.step;
		return this.flow.tools.map((tool, index) => ({
			index,
			n: index + 1,
			tool,
			done: index < current,
			current: index === current,
			future: index > current,
		}));
	}

	get nextEnabled() {
		return this.flow.canAdvance && !this.flow.landing;
	}

	slot = modifier((element: HTMLElement) => {
		this.flow.captureListener = (origin) => {
			this.flow.landing = true;
			const flight = flyTo(origin, element).finally(() => {
				this.flow.landing = false;
			});
			// advance after lift-off
			const committed = new Promise<void>((resolve) =>
				setTimeout(resolve, FLIGHT_MS * LIFT_OFF),
			);
			return Promise.race([flight, committed]);
		};
		return () => {
			this.flow.captureListener = null;
		};
	});

	save = (item: FlowFile) => saveBlob(item.file, item.file.name);

	next = () => void this.flow.advance();

	exit = () => {
		if (
			this.flow.files.length === 0 ||
			confirm('Discard captures?')
		)
			void this.flow.exit();
	};

	focus = modifier((element: HTMLElement) => {
		element.focus();
	});

	<template>
		{{#if this.flow.active}}
			<nav
				class="dt-flow
					{{if this.flow.finale 'is-finished'}}"
				aria-label="Flow state"
			>
				<span class="dt-flow-name">
					<Icon @name="workflow" />
					<span
						class="dt-flow-name-text"
					>{{this.name}}</span>
				</span>
				<ol class="dt-flow-steps">
					{{#each
						this.steps key="index"
						as |step|
					}}
						<li>
							<button
								type="button"
								class="dt-flow-step
									{{if
										step.done
										'is-done'
									}}
									{{if
										step.current
										'is-current'
									}}"
								disabled={{step.future}}
								aria-current={{if
									step.current
									"step"
								}}
								{{on
									"click"
									(fn
										this.flow.goTo
										step.index
									)
								}}
							>
								<span
									class="dt-flow-n"
								>
									{{#if
										step.done
									}}
										<Icon
											@name="check"
										/>
									{{else}}
										{{step.n}}
									{{/if}}
								</span>
								<Icon
									@name={{step.tool.icon}}
									class="dt-flow-icon"
								/>
								<span
									class="dt-flow-label"
								>{{step.tool.name}}</span>
							</button>
						</li>
					{{/each}}
				</ol>
				<span class="dt-flow-captures">
					{{#each
						this.flow.captured
						key="@identity"
						as |item|
					}}
						<button
							type="button"
							class="dt-flow-capture"
							title="Save"
							{{on
								"click"
								(fn
									this.save
									item
								)
							}}
						>
							<Icon
								@name="download"
							/>
							<span
								class="dt-flow-capture-name"
							>{{item.file.name}}</span>
							<span
								class="dt-flow-capture-size"
							>{{formatBytes
									item.file.size
								}}</span>
						</button>
					{{/each}}
				</span>
				<span class="dt-flow-action" {{this.slot}}>
					{{#if this.flow.finale}}
						<button
							type="button"
							class="dt-flow-next is-done"
							{{this.focus}}
							{{on
								"click"
								this.flow.finish
							}}
						>
							Download & Exit
							<Icon
								@name="file-down"
							/>
						</button>
					{{else if (not this.flow.isLast)}}
						<button
							type="button"
							class="dt-flow-next"
							disabled={{unless
								this.nextEnabled
								true
							}}
							{{on "click" this.next}}
						>
							Next
							<Icon
								@name="arrow-right"
							/>
						</button>
					{{/if}}
				</span>
				<button
					type="button"
					class="dt-flow-exit"
					aria-label="Exit flow"
					{{on "click" this.exit}}
				>
					<Icon @name="x" />
				</button>
			</nav>
		{{/if}}
	</template>
}
