import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import { isPlainClick } from 'delphitools-v2/services/magazine';
import Icon from 'delphitools-v2/components/icon';
import { patternStyle } from 'delphitools-v2/lib/icon-pattern';
import type { ElsewhereApp } from 'delphitools-v2/lib/tools';
import './elsewhere-app.css';

const Face: TOC<{ Args: { app: ElsewhereApp } }> = <template>
	<span
		class="dt-else-pattern"
		style={{patternStyle @app.tool.icon}}
		aria-hidden="true"
	></span>
	<span class="dt-else-badge">
		{{#if @app.image}}
			<img
				src="/elsewhere/{{@app.image}}.webp"
				width="256"
				height="256"
				alt=""
				class="dt-else-icon"
			/>
		{{else}}
			<span class="dt-else-icon"><Icon
					@name={{@app.tool.icon}}
				/></span>
		{{/if}}
		{{#if @app.version}}
			<span class="dt-else-version">v{{@app.version}}</span>
		{{/if}}
	</span>
	<span class="dt-else-name">{{@app.tool.name}}</span>
	<span class="dt-else-desc">{{@app.tool.description}}</span>
	<span class="dt-else-platforms">{{@app.platforms}}</span>
	{{#if @app.action}}
		<span class="dt-else-action">
			<Icon
				@name={{if
					@app.tool.external
					"download"
					"arrow-right"
				}}
			/>
			{{@app.action}}
		</span>
	{{else}}
		<span class="dt-else-action is-soon">Soon</span>
	{{/if}}
</template>;

const BETA_STEPS = [
	{
		message: 'this is in BETA. do you understand what that means? it means that there will be no support from me, and that you should ideally SEND ME FEEDBACK. This is NOT DONE YET.',
		confirm: 'I understand',
	},
	{
		message: "I don't think you do. This is not meant to be run. I did do my best to not have this completely fall apart, but there are numerous significant known issues here. ONLY RUN THIS if you're willing to write me emails about your experience.",
		confirm: "I'll write emails",
	},
];

export default class ElsewhereAppCard extends Component<{
	Args: { app: ElsewhereApp };
}> {
	@tracked warning = false;
	@tracked stepIndex = 0;

	get step() {
		return BETA_STEPS[this.stepIndex]!;
	}

	warn = (event: MouseEvent) => {
		if (!this.args.app.beta || !isPlainClick(event)) return;
		event.preventDefault();
		this.warning = true;
	};

	closeWarning = () => {
		this.warning = false;
		this.stepIndex = 0;
	};

	// opened inside the click, or the popup blocker stops it
	proceed = (close: (value?: string) => void) => {
		if (this.stepIndex < BETA_STEPS.length - 1) {
			this.stepIndex++;
			return;
		}
		window.open(this.args.app.tool.href, '_blank', 'noopener');
		close('confirm');
	};

	<template>
		{{#if @app.action}}
			<a
				href={{@app.tool.href}}
				class="dt-else"
				target={{if @app.tool.external "_blank"}}
				rel={{if
					@app.tool.external
					"noopener noreferrer"
				}}
				{{on "click" this.warn}}
			><Face @app={{@app}} /></a>
		{{else}}
			<div class="dt-else is-soon"><Face
					@app={{@app}}
				/></div>
		{{/if}}
		{{#if @app.beta}}
			<CanonDialog
				class="dt-else-warning"
				@open={{this.warning}}
				@alert={{true}}
				@message={{this.step.message}}
				@onClose={{this.closeWarning}}
				aria-label="Beta warning"
			>
				<:header>
					<img
						class="dt-else-warning-art"
						src="/substrata/onboarding/not-finished.webp"
						width="1000"
						height="394"
						alt=""
					/>
				</:header>
				<:footer as |close|>
					<CanonButton
						@text="Cancel"
						@onClick={{fn close "cancel"}}
					/>
					<CanonButton
						@kind="primary"
						@text={{this.step.confirm}}
						@onClick={{fn
							this.proceed
							close
						}}
					/>
				</:footer>
			</CanonDialog>
		{{/if}}
	</template>
}
