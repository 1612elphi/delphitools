import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import Icon from 'delphitools-v2/components/icon';
import {
	ORDINALS,
	workflowTools,
	type Workflow,
} from 'delphitools-v2/lib/workflows';
import type FlowService from 'delphitools-v2/services/flow';

interface Signature {
	Args: { model: Workflow };
}

const GLYPHS: Record<string, string[]> = {
	D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
	E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
	L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
	P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
	H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
	I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
};
const WORD = 'DELPHI';
const BARCODE_WIDTH = WORD.length * 6 - 1;

const BARS = [...WORD].flatMap((letter, k) => {
	const rows = GLYPHS[letter]!;
	const bars: { x: number; y: number; h: number }[] = [];
	for (let c = 0; c < 5; c++) {
		let start = -1;
		for (let r = 0; r <= rows.length; r++) {
			const lit = r < rows.length && rows[r]![c] === '1';
			if (lit && start < 0) start = r;
			if (!lit && start >= 0) {
				bars.push({
					x: k * 6 + c,
					y: start,
					h: r - start - 0.15,
				});
				start = -1;
			}
		}
	}
	return bars;
});

class WorkflowTemplate extends Component<Signature> {
	@service declare flow: FlowService;

	get legs() {
		return workflowTools(this.args.model).map((tool, index) => ({
			tool,
			ordinal: ORDINALS[index],
		}));
	}

	start = () => void this.flow.start(this.args.model);

	<template>
		{{pageTitle "Workflow"}}

		<div class="dt-pass-room">
			<svg class="dt-pass-wallpaper" aria-hidden="true">
				<defs>
					<pattern
						id="dt-pass-hex"
						width="120"
						height="208"
						patternUnits="userSpaceOnUse"
					>
						<image
							href="/art/alien-badge.webp"
							x="10"
							y="32"
							width="40"
							height="40"
						/>
						<image
							href="/art/alien-badge.webp"
							x="70"
							y="136"
							width="40"
							height="40"
						/>
					</pattern>
				</defs>
				<rect
					width="100%"
					height="100%"
					fill="url(#dt-pass-hex)"
				/>
			</svg>
			<article class="dt-pass">
				<div class="dt-pass-main">
					<p class="dt-pass-band">
						<Icon @name="workflow" />
						delphitools Workflow:
					</p>
					<ol class="dt-pass-legs">
						{{#each
							this.legs key="tool.id"
							as |leg|
						}}
							<li class="dt-pass-leg">
								<span
									class="dt-pass-ord"
								>{{leg.ordinal}}</span>
								<span
									class="dt-pass-tool"
								>
									<Icon
										@name={{leg.tool.icon}}
									/>
									<span
									>{{leg.tool.name}}</span>
								</span>
							</li>
						{{/each}}
					</ol>
				</div>
				<div class="dt-pass-stub">
					<svg
						class="dt-pass-barcode"
						viewBox="0 0 {{BARCODE_WIDTH}} 7"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						{{#each BARS as |bar|}}
							<rect
								x={{bar.x}}
								y={{bar.y}}
								width="0.7"
								height={{bar.h}}
							/>
						{{/each}}
					</svg>
					<button
						type="button"
						class="dt-wf-go dt-pass-go"
						{{on "click" this.start}}
					>
						Let's go
						<Icon @name="arrow-right" />
					</button>
				</div>
			</article>
			<LinkTo @route="workflows" class="dt-pass-all">
				All workflows
			</LinkTo>
		</div>
	</template>
}

export default RouteTemplate(WorkflowTemplate);
