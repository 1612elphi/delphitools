import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { array, fn } from '@ember/helper';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type RouterService from '@ember/routing/router-service';
import type { ComponentLike } from '@glint/template';
import { modifier } from 'ember-modifier';
import { pageTitle } from 'ember-page-title';
import CanonCommand, {
	type CanonCommandItem,
} from 'delphicanon/components/canon-command';
import CanonDialog, {
	type CanonDialogClose,
} from 'delphicanon/components/canon-dialog';
import CanonPage from 'delphicanon/components/canon-page';
import CanonSidebarRow from 'delphicanon/components/canon-sidebar-row';
import { IconSvg } from 'delphitools-v2/components/icon';
import 'delphitools-v2/components/canon-docs/icons';
import DocsBody, {
	ScreenPage,
} from 'delphitools-v2/components/canon-docs/pages';
import {
	docsPages,
	neighbours,
	pageFor,
	type DocsPage,
} from 'delphitools-v2/lib/canon-docs';
import './canon-docs.css';

const iconFor = (name: string): ComponentLike => <template>
	<IconSvg @name={{name}} />
</template>;

const commandItems: CanonCommandItem[] = docsPages.map((page) => ({
	id: page.url,
	title: page.heading,
	group: page.section || undefined,
	keywords: [page.title],
	icon: iconFor(page.icon),
}));

const paletteStyle = htmlSafe('--canon-dialog-width: 640px');
const PreviousIcon = iconFor('arrow-left');
const NextIcon = iconFor('arrow-right');
const wide = ['overview', 'patterns', 'screens', 'group'];

export type DocsGo = (event: MouseEvent) => void;

export default class CanonDocs extends Component {
	@service declare router: RouterService;

	@tracked palette = false;

	get page(): DocsPage {
		return (
			pageFor(
				this.router.currentRouteName,
				this.router.currentRoute?.params,
			) ?? docsPages[0]!
		);
	}

	get pager() {
		return neighbours(this.page);
	}

	get isScreen() {
		return this.page.kind === 'screen';
	}

	get maxWidth() {
		if (wide.includes(this.page.kind)) return 1680;
		return this.page.kind === 'pattern' ? 1200 : 760;
	}

	go = (event: MouseEvent) => {
		const link = event.currentTarget as HTMLAnchorElement;
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		void this.router.transitionTo(link.getAttribute('href')!);
	};

	listen = modifier(() => {
		const keydown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== 'k') return;
			if (!(event.metaKey || event.ctrlKey) || event.altKey)
				return;
			event.preventDefault();
			this.palette = true;
		};
		document.addEventListener('keydown', keydown);
		return () => document.removeEventListener('keydown', keydown);
	});

	scrollTop = modifier((element: HTMLElement, [id]: [string]) => {
		if (id) element.scrollTop = 0;
	});

	closePalette = () => (this.palette = false);
	pick = (close: CanonDialogClose, item: CanonCommandItem) => {
		close(item.id);
		void this.router.transitionTo(item.id);
	};

	<template>
		{{pageTitle this.page.heading}}
		<div class="cd-docs" {{this.listen}}>
			{{#if this.isScreen}}
				{{#each (array this.page) key="id" as |page|}}
					<ScreenPage @page={{page}} />
				{{/each}}
			{{else}}
				<CanonPage
					class="cd-page"
					@maxWidth={{this.maxWidth}}
					{{this.scrollTop this.page.id}}
				>
					<DocsBody
						@page={{this.page}}
						@go={{this.go}}
					/>
					{{#if this.pager.previous}}
						<nav
							class="cd-pager"
							aria-label="Pages"
						>
							<CanonSidebarRow
								class="cd-previous"
								rel="prev"
								@title={{this.pager.previous.heading}}
								@icon={{PreviousIcon}}
								@href={{this.pager.previous.url}}
								@onClick={{this.go}}
							/>
							{{#if this.pager.next}}
								<CanonSidebarRow
									class="cd-next"
									rel="next"
									@title={{this.pager.next.heading}}
									@icon={{NextIcon}}
									@href={{this.pager.next.url}}
									@onClick={{this.go}}
								/>
							{{/if}}
						</nav>
					{{/if}}
				</CanonPage>
			{{/if}}
		</div>

		<CanonDialog
			@open={{this.palette}}
			@onClose={{this.closePalette}}
			aria-label="Search docs"
			style={{paletteStyle}}
		>
			<:default as |close|>
				<CanonCommand
					@items={{commandItems}}
					@placeholder="Search docs"
					@onSelect={{fn this.pick close}}
				/>
			</:default>
		</CanonDialog>
	</template>
}
