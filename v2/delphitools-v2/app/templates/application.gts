import Component from '@glimmer/component';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { pageTitle } from 'ember-page-title';
import AppSidebar from 'delphitools-v2/components/app-sidebar';
import AppHeader from 'delphitools-v2/components/app-header';

// The editor route escapes the .dt-shell chrome entirely — Substrata owns the
// whole viewport, the way the Next app keeps /editor outside its (site) route
// group.
export default class ApplicationTemplate extends Component {
	@service declare router: RouterService;

	get isEditor() {
		return this.router.currentRouteName === 'editor';
	}

	<template>
		{{pageTitle "delphitools"}}

		{{#if this.isEditor}}
			{{outlet}}
		{{else}}
			<a href="#main-content" class="dt-skip">Skip to main
				content</a>

			<div class="dt-shell">
				<AppSidebar />
				<div class="dt-inset">
					<AppHeader />
					<main
						id="main-content"
						tabindex="-1"
						class="dt-main"
					>
						{{outlet}}
					</main>
				</div>
			</div>
		{{/if}}
	</template>
}
