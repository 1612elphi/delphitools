import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import Icon from 'delphitools-v2/components/icon';
import ThemeToggle from 'delphitools-v2/components/theme-toggle';
import { getToolById, getCategoryByToolId } from 'delphitools-v2/lib/tools';
import type SidebarService from 'delphitools-v2/services/sidebar';

export default class AppHeader extends Component {
	@service declare router: RouterService;
	@service declare sidebar: SidebarService;

	get toolId(): string | undefined {
		if (this.router.currentRouteName !== 'tools.tool')
			return undefined;
		return this.router.currentRoute?.params?.['tool_id'] as
			string | undefined;
	}

	get tool() {
		const id = this.toolId;
		return id ? getToolById(id) : undefined;
	}

	get category() {
		const id = this.toolId;
		return id ? getCategoryByToolId(id) : undefined;
	}

	get isHome() {
		return this.router.currentRouteName === 'index';
	}

	<template>
		<header class="dt-header">
			<button
				type="button"
				class="dt-icon-btn"
				aria-label="Toggle sidebar"
				{{on "click" this.sidebar.toggle}}
			>
				<Icon @name="panel-left" />
			</button>
			<span class="dt-header-sep" aria-hidden="true"></span>

			{{#if this.tool}}
				<span class="dt-header-title">
					<Icon
						@name={{this.tool.icon}}
						class="dt-header-icon"
					/>
					<h1>{{this.tool.name}}</h1>
					{{#if this.category}}
						<span
							class="dt-badge"
						>{{this.category.name}}</span>
					{{/if}}
				</span>
			{{else if this.isHome}}
				<span class="dt-header-title">
					<Icon
						@name="home"
						class="dt-header-icon"
					/>
					<h1>Home</h1>
				</span>
			{{else}}
				<span class="dt-header-title">
					<img
						src="/delphi.png"
						alt=""
						class="dt-header-icon"
					/>
					<h1>delphitools</h1>
				</span>
			{{/if}}

			<span class="dt-header-actions">
				<ThemeToggle />
			</span>
		</header>
	</template>
}
