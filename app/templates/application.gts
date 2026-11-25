import Component from '@glimmer/component';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import type FlowService from 'delphitools-v2/services/flow';
import type SidebarService from 'delphitools-v2/services/sidebar';
import type ThemeService from 'delphitools-v2/services/theme';
import { pageTitle } from 'ember-page-title';
import CanonButton from 'delphicanon/components/canon-button';
import CanonToast from 'delphicanon/components/canon-toast';
import AppSidebar from 'delphitools-v2/components/app-sidebar';
import AppTab from 'delphitools-v2/components/app-tab';
import BandTape, { TapeShuffle } from 'delphitools-v2/components/band-tape';
import ColourNotationSelector from 'delphitools-v2/components/colour-notation-selector';
import FlowState from 'delphitools-v2/components/flow-state';
import MagazineOverlay from 'delphitools-v2/components/magazine/overlay';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	CANON_KIT_ID,
	getToolById,
	getCategoryByToolId,
} from 'delphitools-v2/lib/tools';

const PAGES: Record<string, { title: string; icon: string }> = {
	index: { title: 'Home', icon: 'home' },
	workflows: { title: 'Workflows', icon: 'workflow' },
	experiments: { title: 'Experiments', icon: 'flask-conical' },
	elsewhere: { title: 'Elsewhere', icon: 'globe' },
};

export default class ApplicationTemplate extends Component {
	@service declare router: RouterService;
	@service declare flow: FlowService;
	@service declare sidebar: SidebarService;
	@service declare theme: ThemeService;

	get isBare() {
		return [
			'editor',
			'errata',
			'workflow',
			'not-found',
			'privacy',
		].includes(this.router.currentRouteName ?? '');
	}

	get toolId(): string | undefined {
		if (this.router.currentRouteName !== 'tools.tool')
			return undefined;
		return this.router.currentRoute?.params?.['tool_id'] as
			string | undefined;
	}

	get page(): { title: string; icon: string; description?: string } {
		const route = this.router.currentRouteName ?? '';
		const tool = this.toolId
			? getToolById(this.toolId)
			: route.startsWith('canon.')
				? getToolById(CANON_KIT_ID)
				: undefined;
		if (tool)
			return {
				title: tool.name,
				icon: tool.icon,
				description: tool.description,
			};
		return (
			PAGES[route] ?? {
				title: 'delphitools',
				icon: 'layout-grid',
			}
		);
	}

	get showsNotation() {
		const id = this.toolId;
		return (
			!!id &&
			getCategoryByToolId(id)?.name === 'Colour' &&
			id !== 'colour-converter'
		);
	}

	<template>
		{{pageTitle "delphitools"}}

		{{#if this.isBare}}
			{{outlet}}
		{{else}}
			<a href="#main-content" class="dt-skip">Skip to main
				content</a>

			<div
				class="dt-frame
					{{if this.sidebar.open 'is-open'}}"
			>
				<div
					id="dt-drawer"
					class="dt-drawer"
					inert={{if
						this.sidebar.open
						false
						true
					}}
				>
					<AppSidebar />
				</div>
				<div class="dt-sheet">
					<BandTape />
					<AppTab
						@title={{this.page.title}}
						@icon={{this.page.icon}}
					/>
					<header class="dt-bar">
						<TapeShuffle />
						<span class="dt-bar-heading">
							<span
								class="dt-bar-title"
							>{{this.page.title}}</span>
							{{#if
								this.page.description
							}}
								<span
									class="dt-bar-detail"
								>{{this.page.description}}</span>
							{{/if}}
						</span>
						{{#if this.showsNotation}}
							<ColourNotationSelector
							/>
						{{/if}}
						<CanonButton
							class="dt-bar-pref"
							@kind="cell"
							@label="Toggle font"
							@icon={{component
								IconSvg
								name="type"
							}}
							@onClick={{this.theme.toggleFont}}
						/>
						<CanonButton
							class="dt-bar-pref"
							@kind="cell"
							@label="Toggle theme"
							@icon={{component
								IconSvg
								name=(if
									this.theme.dark
									"sun"
									"moon"
								)
							}}
							@onClick={{this.theme.toggle}}
						/>
					</header>
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
					<CanonToast />
				</div>
			</div>
		{{/if}}
		<MagazineOverlay />
	</template>
}
