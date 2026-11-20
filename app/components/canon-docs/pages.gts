import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonPage from 'delphicanon/components/canon-page';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSidebarRow from 'delphicanon/components/canon-sidebar-row';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { IconSvg } from 'delphitools-v2/components/icon';
import { brands } from 'delphitools-v2/components/canon-docs/brands/index';
import {
	patternParts,
	type Part,
} from 'delphitools-v2/components/canon-docs/patterns/index';
import { screenParts } from 'delphitools-v2/components/canon-docs/screens/index';
import { tiles } from 'delphitools-v2/components/canon-docs/tiles';
import type { DocsGo } from 'delphitools-v2/components/canon-docs/docs';
import platforms from 'delphitools-v2/lib/canon-platforms.json';
import {
	componentGroups,
	componentNames,
	docsPages,
	docsPatterns,
	docsScreens,
	importLine,
	type DocsPage,
} from 'delphitools-v2/lib/canon-docs';

const LEDE =
	'A collection of web, iOS and Android components for making your own Delphi-style apps.';

const INSTALL_NOTE = '(Not available just yet, sorry, ironing out)';

const KIT_NAME = "Delphi's Canon UI Kit";
const PORTS = ['Ember', 'React', 'Vue', 'Svelte', 'UIKit'];
const LIBRARY_LINE = "import { hex } from 'delphicanon/lib/colour';";
const SERVICE_LINE =
	"export { default } from 'delphicanon/services/canon-toast';";
const VIEWS = ['Live', 'Source'];
const SCREEN_WIDTH = 1200;
const LAYOUT_WIDTH = 900;

const tileByName = new Map(tiles.map((tile) => [tile.name, tile]));
const tileOf = (name: string) => tileByName.get(name);
const portList = (name: string) => {
	const has = (platforms as Record<string, string[]>)[name] ?? [];
	return PORTS.map((port) => ({ port, has: has.includes(port) }));
};

const groups = componentGroups.map((group) => ({
	title: group.title,
	page: docsPages.find(
		(page) => page.kind === 'group' && page.heading === group.title,
	)!,
	pages: docsPages.filter(
		(page) =>
			page.kind === 'component' &&
			group.names.includes(page.name),
	),
}));
const componentsOf = (slug: string) =>
	docsPages.filter(
		(page) =>
			page.kind === 'component' &&
			page.section.toLowerCase() === slug,
	);
const brandOf = (port: string) => brands[port];

const Ports: TOC<{ Args: { name: string; labels?: boolean } }> = <template>
	<span class="cd-ports {{if @labels 'cd-ports--labels'}}">
		{{#each (portList @name) as |entry|}}
			<span
				class="cd-port"
				data-has={{if entry.has "true" "false"}}
				title={{entry.port}}
			>
				<span
					class="cd-brand"
					aria-hidden="true"
				>{{brandOf entry.port}}</span>
				{{#if @labels}}
					{{entry.port}}
				{{else}}
					<span
						class="dt-sr-only"
					>{{entry.port}}</span>
				{{/if}}
			</span>
		{{/each}}
	</span>
</template>;

const isCard = new Map(docsPatterns.map((entry) => [entry.id, entry.card]));
const patternPages = docsPages.filter((page) => page.kind === 'pattern');
const cardPages = patternPages.filter((page) => isCard.get(page.name));
const screenPages = docsPages.filter((page) => page.kind === 'screen');

const counts = [
	{ label: 'Components', value: String(componentNames.length) },
	{ label: 'Patterns', value: String(docsPatterns.length) },
	{ label: 'Screens', value: String(docsScreens.length) },
];

const patternOf = (name: string) => patternParts[name];
const screenOf = (name: string) => screenParts[name];
const cardOf = (name: string) => isCard.get(name) === true;
const eq = (a: unknown, b: unknown) => a === b;

const fit = modifier((thumb: HTMLElement, [width]: [number]) => {
	const inner = thumb.firstElementChild as HTMLElement;
	inner.style.inlineSize = `${width}px`;
	inner.style.blockSize = `${(width * 10) / 16}px`;
	const observer = new ResizeObserver(() => {
		inner.style.scale = String(thumb.clientWidth / width);
	});
	observer.observe(thumb);
	return () => observer.disconnect();
});

const Thumb: TOC<{ Args: { part: Part; width: number } }> = <template>
	<div class="cd-thumb" inert {{fit @width}}>
		<div class="cd-thumb-inner"><@part.Live /></div>
	</div>
</template>;

const Card: TOC<{ Args: { page: DocsPage; go: DocsGo } }> = <template>
	<CanonRows @framed={{true}} class="cd-card" data-card={{@page.name}}>
		<a class="cd-card-head" href={{@page.url}} {{on "click" @go}}>
			<IconSvg @name={{@page.icon}} />
			<span class="cd-card-title">{{@page.title}}</span>
			<IconSvg @name="arrow-up-right" />
		</a>
		{{#if (eq @page.kind "screen")}}
			{{#let (screenOf @page.name) as |part|}}
				{{#if part}}<Thumb
						@part={{part}}
						@width={{SCREEN_WIDTH}}
					/>{{/if}}
			{{/let}}
		{{else}}
			{{#let (patternOf @page.name) as |part|}}
				{{#if part}}
					{{#if (cardOf @page.name)}}
						<part.Live />
					{{else}}
						<Thumb
							@part={{part}}
							@width={{LAYOUT_WIDTH}}
						/>
					{{/if}}
				{{/if}}
			{{/let}}
		{{/if}}
	</CanonRows>
</template>;

const Links: TOC<{ Args: { pages: DocsPage[]; go: DocsGo } }> = <template>
	<div class="cd-links">
		{{#each @pages as |page|}}
			<CanonSidebarRow
				@title={{page.heading}}
				@icon={{component IconSvg name=page.icon}}
				@href={{page.url}}
				@onClick={{@go}}
			/>
		{{/each}}
	</div>
</template>;

const Home: TOC<{ Args: { go: DocsGo } }> = <template>
	<header class="cd-head cd-home-head">
		<h1 class="cd-title cd-kit">{{KIT_NAME}}</h1>
		<p class="cd-lede">{{LEDE}}</p>
	</header>
	<div class="cd-masonry">
		{{#each cardPages as |page|}}
			<Card @page={{page}} @go={{@go}} />
		{{/each}}
	</div>
</template>;

const Installation: TOC<object> = <template>
	<header class="cd-head">
		<h1 class="cd-title">Installation</h1>
		<p class="cd-lede">{{INSTALL_NOTE}}</p>
	</header>
	<CanonRows class="cd-import" @framed={{true}}>
		<CanonHeading @text="Imports" />
		<CanonValueLine
			@label="Component"
			@value={{importLine "canon-slider"}}
			@layout="wrapping"
		/>
		<CanonValueLine
			@label="Library"
			@value={{LIBRARY_LINE}}
			@layout="wrapping"
		/>
		<CanonValueLine
			@label="Service"
			@value={{SERVICE_LINE}}
			@layout="wrapping"
		/>
	</CanonRows>
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Platforms" />
		<CanonRow @title="The Web">
			<span class="cd-brands" aria-hidden="true">
				<span class="cd-brand">{{brandOf
						"Ember"
					}}</span>
				<span class="cd-brand">{{brandOf
						"React"
					}}</span>
				<span class="cd-brand">{{brandOf "Vue"}}</span>
				<span class="cd-brand">{{brandOf
						"Svelte"
					}}</span>
			</span>
		</CanonRow>
		<CanonRow @title="UIKit">
			<span class="cd-brands" aria-hidden="true">
				<span class="cd-brand">{{brandOf
						"UIKit"
					}}</span>
			</span>
		</CanonRow>
		<CanonRow @title="Jetpack Compose">
			<span class="cd-brands" aria-hidden="true">
				<span class="cd-brand">{{brandOf
						"Jetpack Compose"
					}}</span>
			</span>
			<CanonStatus @text="Planned" @tone="muted" />
		</CanonRow>
	</CanonRows>
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Contents" />
		<CanonTiles @items={{counts}} />
	</CanonRows>
</template>;

const Components: TOC<{ Args: { go: DocsGo } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">Components</h1>
	</header>
	{{#each groups as |group|}}
		<CanonRows @framed={{true}}>
			<a
				class="cd-card-head"
				href={{group.page.url}}
				{{on "click" @go}}
			>
				<IconSvg @name={{group.page.icon}} />
				<span
					class="cd-card-title"
				>{{group.title}}</span>
				<IconSvg @name="arrow-up-right" />
			</a>
			<Links @pages={{group.pages}} @go={{@go}} />
		</CanonRows>
	{{/each}}
</template>;

const ComponentPage: TOC<{ Args: { page: DocsPage } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">{{@page.heading}}</h1>
	</header>
	{{#let (tileOf @page.name) as |tile|}}
		{{#if tile}}
			<CanonRows class="cd-demo" @framed={{true}}>
				<CanonHeading @text="Example" />
				<tile.Live />
			</CanonRows>
		{{/if}}
	{{/let}}
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Usage" />
		<CanonValueLine
			class="cd-import"
			@label="Import"
			@value={{importLine @page.name}}
			@layout="wrapping"
		/>
	</CanonRows>
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Platforms" />
		<div class="cd-ports-row">
			<Ports @name={{@page.name}} @labels={{true}} />
		</div>
	</CanonRows>
</template>;

const GroupPage: TOC<{ Args: { page: DocsPage; go: DocsGo } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">{{@page.heading}}</h1>
	</header>
	<div class="cd-masonry cd-group">
		{{#each (componentsOf @page.name) as |entry|}}
			<CanonRows
				@framed={{true}}
				class="cd-card"
				data-component={{entry.name}}
			>
				<a
					class="cd-card-head"
					href={{entry.url}}
					{{on "click" @go}}
				>
					<span
						class="cd-card-title"
					>{{entry.heading}}</span>
					<Ports @name={{entry.name}} />
					<IconSvg @name="arrow-up-right" />
				</a>
				{{#let (tileOf entry.name) as |tile|}}
					{{#if tile}}
						<tile.Live />
					{{/if}}
				{{/let}}
				<CanonValueLine
					class="cd-import"
					@label="Import"
					@value={{importLine entry.name}}
					@layout="wrapping"
				/>
			</CanonRows>
		{{/each}}
	</div>
</template>;

const Patterns: TOC<{ Args: { go: DocsGo } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">Patterns</h1>
	</header>
	<div class="cd-masonry">
		{{#each patternPages as |page|}}
			<Card @page={{page}} @go={{@go}} />
		{{/each}}
	</div>
</template>;

const Screens: TOC<{ Args: { go: DocsGo } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">Screens</h1>
	</header>
	<div class="cd-screens">
		{{#each screenPages as |page|}}
			<Card @page={{page}} @go={{@go}} />
		{{/each}}
	</div>
</template>;

const PatternPage: TOC<{ Args: { page: DocsPage } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">{{@page.heading}}</h1>
	</header>
	{{#let (patternOf @page.name) as |part|}}
		{{#if part}}
			{{#if (cardOf @page.name)}}
				<div class="cd-stage-card">
					<CanonRows
						@framed={{true}}
						class="cd-card cd-live"
					>
						<part.Live />
					</CanonRows>
				</div>
			{{else}}
				<div class="cd-block cd-live">
					<part.Live />
				</div>
			{{/if}}
			<CanonCodeBlock
				class="cd-source"
				@code={{part.source}}
				@language="gts"
				@maxHeight={{560}}
			/>
		{{/if}}
	{{/let}}
</template>;

export class ScreenPage extends Component<{ Args: { page: DocsPage } }> {
	@tracked view = 0;

	get part() {
		return screenParts[this.args.page.name];
	}

	pick = (view: number) => (this.view = view);

	<template>
		<div class="cd-screen-page">
			<div class="cd-screen-bar">
				<h1 class="cd-title">{{@page.heading}}</h1>
				<CanonSegmented
					class="cd-views"
					aria-label="View"
					@items={{VIEWS}}
					@selected={{this.view}}
					@onChange={{this.pick}}
				/>
			</div>
			{{#if this.part}}
				<div
					class="cd-screen cd-live"
					hidden={{eq this.view 1}}
				>
					<this.part.Live />
				</div>
				{{#if this.view}}
					<CanonPage
						class="cd-screen-source"
						@maxWidth={{960}}
					>
						<CanonCodeBlock
							class="cd-source"
							@code={{this.part.source}}
							@language="gts"
						/>
					</CanonPage>
				{{/if}}
			{{/if}}
		</div>
	</template>
}

const DocsBody: TOC<{ Args: { page: DocsPage; go: DocsGo } }> = <template>
	{{#if (eq @page.kind "overview")}}
		<Home @go={{@go}} />
	{{else if (eq @page.kind "installation")}}
		<Installation />
	{{else if (eq @page.kind "components")}}
		<Components @go={{@go}} />
	{{else if (eq @page.kind "group")}}
		<GroupPage @page={{@page}} @go={{@go}} />
	{{else if (eq @page.kind "component")}}
		<ComponentPage @page={{@page}} />
	{{else if (eq @page.kind "patterns")}}
		<Patterns @go={{@go}} />
	{{else if (eq @page.kind "pattern")}}
		<PatternPage @page={{@page}} />
	{{else if (eq @page.kind "screens")}}
		<Screens @go={{@go}} />
	{{/if}}
</template>;

export default DocsBody;
