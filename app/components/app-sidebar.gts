import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { LinkTo } from '@ember/routing';
import Dialog from 'delphitools-v2/components/ui/dialog';
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from 'delphitools-v2/components/ui/tooltip';
import Icon from 'delphitools-v2/components/icon';
import AboutDelphitoolsBody from 'delphitools-v2/components/about-delphitools';
import { toolCategories, featuredTools } from 'delphitools-v2/lib/tools';
import type { Tool, ToolCategory } from 'delphitools-v2/lib/tools';
import { COMMIT_SHA, PRIDE } from 'delphitools-v2/lib/build-flags';
import type SidebarService from 'delphitools-v2/services/sidebar';

function matches(tool: Tool, query: string) {
	return (
		tool.name.toLowerCase().includes(query) ||
		tool.description.toLowerCase().includes(query)
	);
}

// A nav link shows its own label when the sidebar is expanded, so the tooltip
// is only rendered on the icon-only rail.
const NavTip: TOC<{
	Args: { label: string; show: boolean };
	Blocks: { default: [] };
}> = <template>
	<Tooltip>
		<TooltipTrigger>{{yield}}</TooltipTrigger>
		{{#if @show}}
			<TooltipContent
				@side="right"
			>{{@label}}</TooltipContent>
		{{/if}}
	</Tooltip>
</template>;

export default class AppSidebar extends Component {
	@service declare sidebar: SidebarService;

	@tracked search = '';

	pride = PRIDE;
	commitSha = COMMIT_SHA;

	get collapsed() {
		return (
			this.sidebar.state === 'collapsed' &&
			!this.sidebar.isMobile
		);
	}

	get query() {
		return this.search.toLowerCase();
	}

	get featured(): Tool[] {
		return featuredTools.filter((t) => matches(t, this.query));
	}

	// Alphabetical within each category, and categories with no match drop out.
	get categories(): ToolCategory[] {
		return toolCategories.flatMap((cat) => {
			const tools = cat.tools
				.filter((t) => matches(t, this.query))
				.sort((a, b) => a.name.localeCompare(b.name));
			return tools.length > 0 ? [{ ...cat, tools }] : [];
		});
	}

	get empty() {
		return (
			this.query.length > 0 &&
			this.featured.length === 0 &&
			this.categories.length === 0
		);
	}

	onSearch = (event: Event) => {
		this.search = (event.target as HTMLInputElement).value;
	};

	clearSearch = () => {
		this.search = '';
	};

	<template>
		{{! Mobile scrim: the drawer sits over the page rather than beside it }}
		{{#if this.sidebar.openMobile}}
			<button
				type="button"
				class="dt-sidebar-scrim"
				aria-label="Close navigation"
				{{on "click" this.sidebar.closeMobile}}
			></button>
		{{/if}}

		<aside
			class="dt-sidebar"
			data-state={{this.sidebar.state}}
			data-mobile={{if this.sidebar.isMobile "true" "false"}}
			data-open-mobile={{if
				this.sidebar.openMobile
				"true"
				"false"
			}}
		>
			<div class="dt-sidebar-header">
				<LinkTo @route="index" class="dt-brand">
					<img
						src="/delphi-lowlod.png"
						width="64"
						height="64"
						{{! decorative: the link already carries the wordmark as text }}
						alt=""
						class="dt-brand-logo
							{{if
								this.pride
								'pride-ring'
							}}"
					/>
					<span class="dt-brand-text">
						<span
							class="dt-brand-name
								{{if
									this.pride
									'pride-wordmark'
								}}"
						>
							delphitools
						</span>
						<span class="dt-brand-sub">
							<span
								class="dt-brand-tagline
									{{if
										this.pride
										'pride-tagline'
									}}"
							>
								{{#if
									this.pride
								}}trans rights{{else}}indie
									tools{{/if}}
							</span>
							<span
								class="dt-brand-sha"
								title="Build commit"
							>
								version:
								{{this.commitSha}}
							</span>
						</span>
					</span>
				</LinkTo>
			</div>

			<div class="dt-sidebar-search">
				<Icon @name="search" class="dt-search-icon" />
				<input
					type="text"
					class="dt-search-input"
					placeholder="Search tools..."
					aria-label="Search tools"
					value={{this.search}}
					{{on "input" this.onSearch}}
				/>
				{{#if this.search}}
					<button
						type="button"
						class="dt-search-clear"
						aria-label="Clear search"
						{{on "click" this.clearSearch}}
					>
						<Icon @name="x" />
					</button>
				{{/if}}
			</div>

			<nav aria-label="Main" class="dt-sidebar-nav">
				{{#unless this.query}}
					<div class="dt-nav-group">
						<NavTip
							@label="Home"
							@show={{this.collapsed}}
						>
							<LinkTo
								@route="index"
								class="dt-nav-link"
							>
								<Icon
									@name="home"
								/>
								<span
									class="dt-nav-label"
								>Home</span>
							</LinkTo>
						</NavTip>
						{{! the editor is more than a tool, so it sits with Home }}
						<NavTip
							@label="Substrata"
							@show={{this.collapsed}}
						>
							<LinkTo
								@route="editor"
								class="dt-nav-link"
							>
								<Icon
									@name="brush"
								/>
								<span
									class="dt-nav-label"
								>Substrata</span>
							</LinkTo>
						</NavTip>
					</div>
				{{/unless}}

				{{#if this.empty}}
					<output
						class="dt-nav-empty"
						aria-live="polite"
					>No tools found</output>
				{{/if}}

				{{#if this.featured.length}}
					<div class="dt-nav-group">
						<h2 class="dt-nav-group-label">
							<Icon
								@name="star"
								class="dt-star"
							/>
							Greatest Hits
						</h2>
						{{#each
							this.featured
							as |tool|
						}}
							<NavTip
								@label={{tool.name}}
								@show={{this.collapsed}}
							>
								<LinkTo
									@route="tools.tool"
									@model={{tool.id}}
									class="dt-nav-link dt-nav-link--featured"
								>
									<Icon
										@name={{tool.icon}}
									/>
									<span
										class="dt-nav-label"
									>{{tool.name}}</span>
								</LinkTo>
							</NavTip>
						{{/each}}
					</div>
				{{/if}}

				{{#each this.categories as |category|}}
					<div class="dt-nav-group">
						<h2
							class="dt-nav-group-label"
						>{{category.name}}</h2>
						{{#each
							category.tools
							as |tool|
						}}
							<NavTip
								@label={{tool.name}}
								@show={{this.collapsed}}
							>
								{{#if
									tool.external
								}}
									<a
										href={{tool.href}}
										class="dt-nav-link"
										target="_blank"
										rel="noopener noreferrer"
									>
										<Icon
											@name={{tool.icon}}
										/>
										<span
											class="dt-nav-label"
										>{{tool.name}}</span>
									</a>
								{{else}}
									<LinkTo
										@route="tools.tool"
										@model={{tool.id}}
										class="dt-nav-link"
									>
										<Icon
											@name={{tool.icon}}
										/>
										<span
											class="dt-nav-label"
										>{{tool.name}}</span>
									</LinkTo>
								{{/if}}
							</NavTip>
						{{/each}}
					</div>
				{{/each}}
			</nav>

			<div class="dt-sidebar-footer">
				<Dialog as |d|>
					<button
						type="button"
						class="dt-about"
						{{d.focusOnClose}}
						{{on "click" d.open}}
					>
						<span class="dt-about-text">
							<span>No logins. No
								tracking.</span>
							<span>Long live the
								handmade web.</span>
						</span>
						<Icon
							@name="info"
							class="dt-about-icon"
						/>
						<span class="dt-sr-only">About
							delphitools</span>
					</button>

					<d.Content class="dt-dialog">
						<header class="dt-dialog-head">
							<h2>About delphitools</h2>
							<button
								type="button"
								class="dt-dialog-close"
								aria-label="Close"
								{{on
									"click"
									d.close
								}}
							>
								<Icon
									@name="x"
								/>
							</button>
						</header>
						<AboutDelphitoolsBody />
					</d.Content>
				</Dialog>
			</div>

			{{! click target on the sidebar's outer edge, as shadcn's SidebarRail }}
			<button
				type="button"
				class="dt-sidebar-rail"
				aria-label="Toggle sidebar"
				tabindex="-1"
				{{on "click" this.sidebar.toggle}}
			></button>
		</aside>
	</template>
}
