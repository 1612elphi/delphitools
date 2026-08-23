import Component from '@glimmer/component';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import type FlowService from 'delphitools-v2/services/flow';
import { pageTitle } from 'ember-page-title';
import AppSidebar from 'delphitools-v2/components/app-sidebar';
import AppHeader from 'delphitools-v2/components/app-header';
import FlowState from 'delphitools-v2/components/flow-state';

// The editor route escapes the .dt-shell chrome entirely — Substrata owns the
// whole viewport, the way the Next app keeps /editor outside its (site) route
// group.
export default class ApplicationTemplate extends Component {
	@service declare router: RouterService;
	@service declare flow: FlowService;

	get isBare() {
		// Editor owns the canvas; 404 owns the whole tiled viewport. Both
		// route groups skip the sidebar/header chrome entirely.
		return ['editor', 'not-found'].includes(
			this.router.currentRouteName ?? '',
		);
	}

	<template>
		{{pageTitle "delphitools"}}

		{{#if this.isBare}}
			{{outlet}}
		{{else}}
			<a href="#main-content" class="dt-skip">Skip to main
				content</a>

			<div class="dt-shell">
				<AppSidebar />
				<div class="dt-inset">
					<AppHeader />
					<FlowState />
					<main
						id="main-content"
						tabindex="-1"
						class="dt-main
							{{if
								this.flow.finale
								'is-behind'
							}}"
						inert={{if
							this.flow.finale
							true
						}}
						{{this.flow.main}}
					>
						{{outlet}}
					</main>
				</div>
			</div>
		{{/if}}
	</template>
}
