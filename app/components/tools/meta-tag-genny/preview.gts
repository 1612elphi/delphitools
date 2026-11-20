import Component from '@glimmer/component';
import { array } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import {
	LIMITS,
	cut,
	host,
	imageLabel,
	trail,
} from 'delphitools-v2/components/tools/meta-tag-genny/tags';

export interface PreviewContent {
	title: string;
	description: string;
	url: string;
	siteName: string;
	image: string;
	large: boolean;
}

const barStyle = (share: number) => htmlSafe(`inline-size: ${share * 100}%`);
const blank = (text: string) => text.trim() === '';

const Text: TOC<{
	Args: { text: string; bars: number[] };
	Element: HTMLSpanElement;
}> = <template>
	{{#if (blank @text)}}
		<span class="mt-bars" aria-hidden="true" ...attributes>
			{{#each @bars as |share|}}
				<span
					class="mt-bar"
					style={{barStyle share}}
				></span>
			{{/each}}
		</span>
	{{else}}
		<span ...attributes>{{@text}}</span>
	{{/if}}
</template>;

const siteOf = (content: PreviewContent) =>
	content.siteName.trim() || host(content.url);

export class Result extends Component<{ Args: { content: PreviewContent } }> {
	get site() {
		return siteOf(this.args.content);
	}

	get mark() {
		return [...this.site][0]?.toUpperCase() ?? '';
	}

	get trail() {
		return trail(this.args.content.url);
	}

	get title() {
		return cut(this.args.content.title.trim(), LIMITS.title);
	}

	get description() {
		return cut(
			this.args.content.description.trim(),
			LIMITS.description,
		);
	}

	<template>
		<div class="mt-result">
			<div class="mt-result-head">
				<span
					class="mt-result-mark"
				>{{this.mark}}</span>
				<span class="mt-result-names">
					<Text
						class="mt-result-site"
						@text={{this.site}}
						@bars={{array 0.35}}
					/>
					<Text
						class="mt-result-trail"
						@text={{this.trail}}
						@bars={{array 0.6}}
					/>
				</span>
			</div>
			<Text
				class="mt-result-title"
				@text={{this.title}}
				@bars={{array 0.8}}
			/>
			<Text
				class="mt-result-description"
				@text={{this.description}}
				@bars={{array 1 0.9 0.45}}
			/>
		</div>
	</template>
}

export default class Board extends Component<{
	Args: { content: PreviewContent };
}> {
	get host() {
		return host(this.args.content.url);
	}

	get caption() {
		return ['PREVIEW', this.host].filter(Boolean).join('  ·  ');
	}

	get cardSite() {
		return siteOf(this.args.content).toUpperCase();
	}

	get image() {
		const { image, large } = this.args.content;
		return imageLabel(image, large);
	}

	<template>
		<figure class="mt-board" aria-label="Preview">
			<figcaption
				class="mt-caption"
			>{{this.caption}}</figcaption>
			<div class="mt-objects">
				<div
					class="mt-sheet mt-card
						{{if
							@content.large
							'mt-card--large'
						}}"
				>
					<div class="mt-image">
						<Icon @name="image" />
						<span
							class="mt-image-name"
						>{{this.image}}</span>
					</div>
					<div class="mt-card-text">
						<Text
							class="mt-card-site"
							@text={{this.cardSite}}
							@bars={{array 0.4}}
						/>
						<Text
							class="mt-card-title"
							@text={{@content.title}}
							@bars={{array 0.95 0.6}}
						/>
						<Text
							class="mt-card-description"
							@text={{@content.description}}
							@bars={{array 1 0.75}}
						/>
					</div>
				</div>
				<div class="mt-sheet mt-beside">
					<Result @content={{@content}} />
				</div>
			</div>
		</figure>
	</template>
}
