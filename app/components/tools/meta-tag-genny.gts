import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextArea from 'delphicanon/components/canon-text-area';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import Board, {
	Result,
	type PreviewContent,
} from 'delphitools-v2/components/tools/meta-tag-genny/preview';
import {
	LIMITS,
	OG_TYPES,
	TWITTER_CARDS,
	generateMetaTags,
	type MetaFields,
} from 'delphitools-v2/components/tools/meta-tag-genny/tags';
import './meta-tag-genny/meta-tag-genny.css';

type TextField = Exclude<keyof MetaFields, 'ogType' | 'twitterCard'>;

const CopyIcon = <template><IconSvg @name="copy" /></template>;

const DESCRIPTION_PLACEHOLDER = 'A brief description of your page...';
const IMAGE_NOTE = 'Recommended size: 1200×630px';
const HANDLE_PLACEHOLDER = '@username';

const SAMPLE: Omit<MetaFields, 'ogType' | 'twitterCard'> = {
	title: 'Field Notes: printing at home',
	description:
		'A weekly letter about risograph printing, paper stocks and the tools that keep a small press running.',
	keywords: 'printing, risograph, paper',
	author: 'R. Morgan',
	url: 'https://example.com/notes/printing-at-home',
	siteName: 'Field Notes',
	image: 'https://example.com/images/press-room.jpg',
	twitterHandle: '@fieldnotes',
};
const LONG_TITLE =
	'Field Notes: a weekly letter on printing, paper and the small tools that make both a little easier';

export default class MetaTagGennyTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked title = '';
	@tracked description = '';
	@tracked keywords = '';
	@tracked author = '';
	@tracked url = '';
	@tracked image = '';
	@tracked siteName = '';
	@tracked twitterHandle = '';
	@tracked ogType = 0;
	@tracked twitterCard = 1;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		if (query.get('metaSample')) {
			Object.assign(this, SAMPLE);
			if (query.get('metaLong')) this.title = LONG_TITLE;
		}
		const card = TWITTER_CARDS.indexOf(query.get('metaCard') ?? '');
		if (card >= 0) this.twitterCard = card;
	}

	get fields(): MetaFields {
		return {
			title: this.title,
			description: this.description,
			keywords: this.keywords,
			author: this.author,
			url: this.url,
			image: this.image,
			siteName: this.siteName,
			twitterHandle: this.twitterHandle,
			ogType: OG_TYPES[this.ogType] ?? 'website',
			twitterCard:
				TWITTER_CARDS[this.twitterCard] ?? 'summary',
		};
	}

	get tags() {
		return generateMetaTags(this.fields);
	}

	get content(): PreviewContent {
		return {
			title: this.title,
			description: this.description,
			url: this.url,
			siteName: this.siteName,
			image: this.image,
			large: this.twitterCard === 1,
		};
	}

	get titleCount() {
		return `${[...this.title].length} / ${LIMITS.title}`;
	}

	get titleOver() {
		return [...this.title].length > LIMITS.title;
	}

	get descriptionCount() {
		return `${[...this.description].length} / ${LIMITS.description}`;
	}

	get descriptionOver() {
		return [...this.description].length > LIMITS.description;
	}

	set = (field: TextField, value: string) => {
		this[field] = value;
	};

	setOgType = (index: number) => {
		this.ogType = index;
	};

	setCard = (index: number) => {
		this.twitterCard = index;
	};

	copy = () => void this.toast.copy(this.tags);

	<template>
		<CanonSplit class="meta-tag-genny" @halves={{true}}>
			<:banner>
				<CanonCanvas
					@fitting={{true}}
					@animated={{true}}
				>
					<Board @content={{this.content}} />
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Basic Meta Tags" />
					<CanonRow
						class="{{if
								this.titleOver
								'mt-over'
							}}"
						@title="Page Title"
						@detail={{this.titleCount}}
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="mt-cell"
							@value={{this.title}}
							@placeholder="My Awesome Website"
							@onChange={{fn
								this.set
								"title"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						class="{{if
								this.descriptionOver
								'mt-over'
							}}"
						@title="Description"
						@detail={{this.descriptionCount}}
						@form="stacked"
						as |titleId|
					>
						<CanonTextArea
							class="mt-description"
							@value={{this.description}}
							@placeholder={{DESCRIPTION_PLACEHOLDER}}
							@height={{96}}
							@onChange={{fn
								this.set
								"description"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="Keywords"
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="mt-cell"
							@value={{this.keywords}}
							@onChange={{fn
								this.set
								"keywords"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="Author"
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="mt-cell"
							@value={{this.author}}
							@onChange={{fn
								this.set
								"author"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="Canonical URL"
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="mt-cell mt-cell--url"
							type="url"
							spellcheck="false"
							autocapitalize="off"
							@value={{this.url}}
							@placeholder="https://example.com"
							@onChange={{fn
								this.set
								"url"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Social Sharing" />
					<CanonRow
						@title="Site name"
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="mt-cell"
							@value={{this.siteName}}
							@placeholder="My Website"
							@onChange={{fn
								this.set
								"siteName"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="OG Image URL"
						@detail={{IMAGE_NOTE}}
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="mt-cell mt-cell--url"
							type="url"
							spellcheck="false"
							autocapitalize="off"
							@value={{this.image}}
							@placeholder="https://example.com/og-image.jpg"
							@onChange={{fn
								this.set
								"image"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="Creator"
						@form="flush"
						as |titleId|
					>
						<CanonTextCell
							class="mt-cell"
							autocapitalize="off"
							@value={{this.twitterHandle}}
							@placeholder={{HANDLE_PLACEHOLDER}}
							@onChange={{fn
								this.set
								"twitterHandle"
							}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonHeading @text="OG Type" />
					<CanonSegmented
						@items={{OG_TYPES}}
						@selected={{this.ogType}}
						@columns={{3}}
						@onChange={{this.setOgType}}
						aria-label="OG Type"
					/>
					<CanonHeading @text="Twitter Card" />
					<CanonSegmented
						@items={{TWITTER_CARDS}}
						@selected={{this.twitterCard}}
						@columns={{2}}
						@onChange={{this.setCard}}
						aria-label="Twitter Card"
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows class="mt-search" @framed={{true}}>
					<CanonHeading @text="Search" />
					<div class="mt-search-row">
						<Result
							@content={{this.content}}
						/>
					</div>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Generated Tags" />
					<CanonCodeBlock
						class="mt-code"
						@code={{this.tags}}
						@language="HTML"
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonButton
						@kind="primary"
						@text="Copy"
						@icon={{CopyIcon}}
						@iconStyle="oversized"
						@onClick={{this.copy}}
					/>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
