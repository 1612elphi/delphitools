import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { LinkTo } from '@ember/routing';
import type RouterService from '@ember/routing/router-service';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonSidebar from 'delphicanon/components/canon-sidebar';
import CanonSidebarRow from 'delphicanon/components/canon-sidebar-row';
import { IconSvg } from 'delphitools-v2/components/icon';
import './app-sidebar.css';
import AboutDelphitoolsBody from 'delphitools-v2/components/about-delphitools';
import { toolCategories, featuredTools } from 'delphitools-v2/lib/tools';
import type { Tool, ToolCategory } from 'delphitools-v2/lib/tools';
import { matchesQuery } from 'delphitools-v2/lib/tool-search';
import { COMMIT_SHA, PRIDE, VERSION } from 'delphitools-v2/lib/build-flags';
import { isHalloween } from 'delphitools-v2/lib/hero-art';
import type SidebarService from 'delphitools-v2/services/sidebar';
import type MagazineService from 'delphitools-v2/services/magazine';
import { isPlainClick } from 'delphitools-v2/services/magazine';
import {
	navIdFor,
	opensSection,
	pageFor,
	searchDocs,
} from 'delphitools-v2/lib/canon-docs';

const PAGES = [
	{ name: 'Home', icon: 'home', href: '/' },
	{ name: 'Substrata', icon: 'substrata', href: '/editor' },
	{ name: 'Errata', icon: 'errata', href: '/errata' },
	{ name: 'Workflows', icon: 'workflow', href: '/workflows' },
	{ name: 'Experiments', icon: 'flask-conical', href: '/experiments' },
];

const SIDEBAR_CATEGORIES: ToolCategory[] = toolCategories.map((cat) => ({
	...cat,
	tools: cat.tools
		.filter((t) => !PAGES.some((page) => page.href === t.href))
		.sort(
			(a, b) =>
				Number(!!b.atlas) - Number(!!a.atlas) ||
				a.name.localeCompare(b.name),
		),
}));

interface NavRowSignature {
	Args: {
		name: string;
		icon?: string;
		href: string;
		external?: boolean;
		magazine?: string;
		description?: string;
		current?: boolean;
	};
	Element: HTMLElement;
}

class NavRow extends Component<NavRowSignature> {
	@service declare router: RouterService;
	@service declare magazine: MagazineService;

	get selected() {
		return (
			this.args.current ??
			this.router.currentURL?.split('?')[0] === this.args.href
		);
	}

	get detail() {
		return this.selected ? this.args.description : undefined;
	}

	go = (event: MouseEvent) => {
		if (this.args.magazine) {
			if (!isPlainClick(event)) return;
			event.preventDefault();
			this.magazine.open(this.args.magazine);
			return;
		}
		if (
			this.args.external ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		void this.router.transitionTo(this.args.href);
	};

	<template>
		{{#if @external}}
			<CanonSidebarRow
				@title={{@name}}
				@icon={{component IconSvg name=@icon}}
				@href={{@href}}
				target="_blank"
				rel="noopener noreferrer"
			/>
		{{else}}
			<CanonSidebarRow
				@title={{@name}}
				@icon={{if
					@icon
					(component IconSvg name=@icon)
				}}
				@href={{@href}}
				@selected={{this.selected}}
				@onClick={{this.go}}
				...attributes
			/>
			{{#if this.detail}}
				<p class="dt-nav-detail">{{this.detail}}</p>
			{{/if}}
		{{/if}}
	</template>
}

export default class AppSidebar extends Component {
	@service declare router: RouterService;
	@service declare sidebar: SidebarService;

	@tracked toolSearch = '';
	@tracked docsSearch = '';
	@tracked aboutOpen = false;

	openAbout = (event: MouseEvent) => {
		(event.currentTarget as HTMLElement).focus();
		this.aboutOpen = true;
	};

	closeAbout = () => {
		this.aboutOpen = false;
	};

	pride = PRIDE;
	halloween = isHalloween();
	commitSha = COMMIT_SHA;
	pages = PAGES;
	opensSection = opensSection;

	get inDocs() {
		const route = this.router.currentRouteName ?? '';
		return route === 'canon' || route.startsWith('canon.');
	}

	get search() {
		return this.inDocs ? this.docsSearch : this.toolSearch;
	}

	get query() {
		return this.search.toLowerCase();
	}

	get docsSections() {
		return searchDocs(this.docsSearch);
	}

	get docsPage() {
		return navIdFor(
			pageFor(
				this.router.currentRouteName,
				this.router.currentRoute?.params,
			),
		);
	}

	isCurrent = (id: string) =>
		this.docsSearch.trim() ? undefined : id === this.docsPage;

	reveal = modifier((nav: HTMLElement, [id]: [string | undefined]) => {
		if (!id) return;
		const scroller = nav.querySelector<HTMLElement>(
			'.canon-sidebar-scroll',
		);
		const row = nav.querySelector<HTMLElement>(
			'.canon-sidebar-rows [aria-current="page"]',
		);
		if (!scroller || !row) return;
		const top = row.offsetTop - scroller.offsetTop;
		if (
			top < scroller.scrollTop ||
			top + row.offsetHeight >
				scroller.scrollTop + scroller.clientHeight
		)
			scroller.scrollTop = top - scroller.clientHeight / 3;
	});

	get featured(): Tool[] {
		return featuredTools.filter((t) => matchesQuery(t, this.query));
	}

	@cached
	get categories(): ToolCategory[] {
		return SIDEBAR_CATEGORIES.flatMap((cat) => {
			const tools = cat.tools.filter((t) =>
				matchesQuery(t, this.query),
			);
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

	shortcut = navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K';

	onSearch = (event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		if (this.inDocs) this.docsSearch = value;
		else this.toolSearch = value;
	};

	clearSearch = () => {
		if (this.inDocs) this.docsSearch = '';
		else this.toolSearch = '';
	};

	searchKey = modifier((input: HTMLInputElement) => {
		const keydown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				!(event.metaKey || event.ctrlKey) ||
				event.key.toLowerCase() !== 'k'
			)
				return;
			event.preventDefault();
			this.sidebar.setOpen(true);
			requestAnimationFrame(() => {
				input.focus();
				input.select();
			});
		};
		window.addEventListener('keydown', keydown);
		return () => window.removeEventListener('keydown', keydown);
	});

	<template>
		<CanonSidebar
			class="dt-sidebar"
			@compact={{true}}
			@collapsed={{false}}
			aria-label={{if this.inDocs "Docs" "Main"}}
			{{this.reveal this.docsPage}}
		>
			<:hero>
				<div class="dt-sidebar-hero">
					{{#if this.inDocs}}
						<NavRow
							class="dt-docs-back"
							@name="delphitools"
							@icon="arrow-left"
							@href={{this.sidebar.appUrl}}
						/>
					{{else}}
						<LinkTo
							@route="index"
							class="dt-brand"
						>
							<img
								src={{if
									this.halloween
									"/heroes/garbajcam.png"
									"/delphi-lowlod.png"
								}}
								width="64"
								height="64"
								alt=""
								class="dt-brand-logo
									{{if
										this.pride
										'pride-ring'
									}}"
							/>
							<span
								class="dt-brand-text"
							>
								<span
									class="dt-brand-name
										{{if
											this.pride
											'pride-wordmark'
										}}"
								>
									{{if
										this.halloween
										"garbajtools"
										"delphitools"
									}}
								</span>
								<span
									class="dt-brand-sub"
								>
									<span
										class="dt-brand-tagline
											{{if
												this.pride
												'pride-tagline'
											}}"
									>
										{{#if
											this.pride
										}}trans
											rights{{else if
											this.halloween
										}}evil
											tools{{else}}indie
											tools{{/if}}
									</span>
									<span
										class="dt-brand-sha"
										title="Build commit"
									>
										v{{VERSION}}
										·
										{{this.commitSha}}
									</span>
								</span>
							</span>
						</LinkTo>
					{{/if}}
					<div class="dt-search">
						<IconSvg @name="search" />
						<input
							type="search"
							class="dt-search-input"
							placeholder={{if
								this.inDocs
								"Search docs..."
								"Search tools..."
							}}
							aria-label={{if
								this.inDocs
								"Search docs"
								"Search tools"
							}}
							value={{this.search}}
							{{on
								"input"
								this.onSearch
							}}
							{{this.searchKey}}
						/>
						{{#if this.search}}
							<button
								type="button"
								class="dt-search-clear"
								aria-label="Clear search"
								{{on
									"click"
									this.clearSearch
								}}
							>
								<IconSvg
									@name="x"
								/>
							</button>
						{{else}}
							<kbd
								class="dt-search-key"
							>{{this.shortcut}}</kbd>
						{{/if}}
					</div>
				</div>
			</:hero>
			<:default>
				{{#if this.inDocs}}
					{{#each this.docsSections as |section|}}
						{{#if section.title}}
							<CanonHeading
								@text={{section.title}}
							/>
						{{/if}}
						{{#each
							section.pages
							as |page|
						}}
							<NavRow
								@name={{page.title}}
								@icon={{if
									(this.opensSection
										page
									)
									page.icon
								}}
								@href={{page.url}}
								@current={{this.isCurrent
									page.id
								}}
							/>
						{{/each}}
					{{else}}
						<output
							class="dt-nav-empty"
							aria-live="polite"
						>No pages</output>
					{{/each}}
				{{else}}
					{{#unless this.query}}
						{{#each this.pages as |page|}}
							<NavRow
								@name={{page.name}}
								@icon={{page.icon}}
								@href={{page.href}}
							/>
						{{/each}}
					{{/unless}}

					{{#if this.empty}}
						<output
							class="dt-nav-empty"
							aria-live="polite"
						>No tools found</output>
					{{/if}}

					{{#if this.featured.length}}
						<CanonHeading
							@text="Greatest Hits"
						/>
						{{#each
							this.featured
							as |tool|
						}}
							<NavRow
								@name={{tool.name}}
								@icon={{tool.icon}}
								@href={{tool.href}}
								@description={{tool.description}}
							/>
						{{/each}}
					{{/if}}

					{{#each this.categories as |category|}}
						<CanonHeading
							@text={{category.name}}
						/>
						{{#each
							category.tools
							as |tool|
						}}
							<NavRow
								@name={{tool.name}}
								@icon={{tool.icon}}
								@href={{tool.href}}
								@external={{if
									tool.magazine
									false
									tool.external
								}}
								@magazine={{if
									tool.magazine
									tool.id
								}}
								@description={{tool.description}}
							/>
						{{/each}}
					{{/each}}

					{{#unless this.query}}
						<CanonHeading
							@text="delphitools"
						/>
						<CanonSidebarRow
							@title="About"
							@icon={{component
								IconSvg
								name="info"
							}}
							{{on
								"click"
								this.openAbout
							}}
						/>
						<CanonDialog
							class="dt-about"
							@open={{this.aboutOpen}}
							@title="About delphitools"
							@onClose={{this.closeAbout}}
						>
							<:default>
								<AboutDelphitoolsBody
								/>
							</:default>
							<:footer as |close|>
								<CanonButton
									@text="Close"
									@onClick={{fn
										close
										""
									}}
								/>
							</:footer>
						</CanonDialog>
						<NavRow
							@name="Privacy"
							@icon="shield-check"
							@href="/privacy"
						/>
					{{/unless}}
				{{/if}}
			</:default>
		</CanonSidebar>
	</template>
}
