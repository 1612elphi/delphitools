import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from 'delphitools-v2/components/icon';

export interface MetaFields {
	title: string;
	description: string;
	url: string;
	image: string;
	siteName: string;
	twitterHandle: string;
}

// google truncates near 60
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

const COPIED_MS = 1500;

// unescaped quotes broke tags
function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function generateMetaTags(fields: MetaFields): string {
	const { title, description, url, image, siteName, twitterHandle } =
		fields;
	const e = escapeAttribute;
	const tags: string[] = [];

	if (title) {
		tags.push(`<title>${e(title)}</title>`);
		tags.push(`<meta name="title" content="${e(title)}">`);
	}
	if (description) {
		tags.push(
			`<meta name="description" content="${e(description)}">`,
		);
	}

	tags.push('');
	tags.push('<!-- Open Graph / Facebook -->');
	tags.push(`<meta property="og:type" content="website">`);
	if (url) tags.push(`<meta property="og:url" content="${e(url)}">`);
	if (title)
		tags.push(`<meta property="og:title" content="${e(title)}">`);
	if (description)
		tags.push(
			`<meta property="og:description" content="${e(description)}">`,
		);
	if (image)
		tags.push(`<meta property="og:image" content="${e(image)}">`);
	if (siteName)
		tags.push(
			`<meta property="og:site_name" content="${e(siteName)}">`,
		);

	tags.push('');
	tags.push('<!-- Twitter -->');
	tags.push(
		`<meta property="twitter:card" content="summary_large_image">`,
	);
	if (url) tags.push(`<meta property="twitter:url" content="${e(url)}">`);
	if (title)
		tags.push(
			`<meta property="twitter:title" content="${e(title)}">`,
		);
	if (description)
		tags.push(
			`<meta property="twitter:description" content="${e(description)}">`,
		);
	if (image)
		tags.push(
			`<meta property="twitter:image" content="${e(image)}">`,
		);
	if (twitterHandle)
		tags.push(
			`<meta property="twitter:creator" content="${e(twitterHandle)}">`,
		);

	return tags.join('\n');
}

const SAMPLE_TITLE = 'Page Title';
const SAMPLE_URL = 'https://example.com';
const SAMPLE_DESCRIPTION = 'Page description will appear here...';
const SAMPLE_CARD_DESCRIPTION = 'Description';
const SAMPLE_HOST = 'example.com';

// template lint reads @ as path
const TWITTER_PLACEHOLDER = '@username';

export function previewHost(url: string): string {
	try {
		return new URL(url || SAMPLE_URL).hostname;
	} catch {
		return SAMPLE_HOST;
	}
}

export default class MetaTagGennyTool extends Component {
	@tracked title = '';
	@tracked description = '';
	@tracked url = '';
	@tracked image = '';
	@tracked siteName = '';
	@tracked twitterHandle = '';
	@tracked copied = false;
	@tracked showPreview = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get fields(): MetaFields {
		return {
			title: this.title,
			description: this.description,
			url: this.url,
			image: this.image,
			siteName: this.siteName,
			twitterHandle: this.twitterHandle,
		};
	}

	get tags() {
		return generateMetaTags(this.fields);
	}

	get titleCount() {
		return `${this.title.length}/${TITLE_LIMIT}`;
	}

	get titleOver() {
		return this.title.length > TITLE_LIMIT;
	}

	get descriptionCount() {
		return `${this.description.length}/${DESCRIPTION_LIMIT}`;
	}

	get descriptionOver() {
		return this.description.length > DESCRIPTION_LIMIT;
	}

	get previewTitle() {
		return this.title || SAMPLE_TITLE;
	}

	get previewUrl() {
		return this.url || SAMPLE_URL;
	}

	get previewDescription() {
		return this.description || SAMPLE_DESCRIPTION;
	}

	get cardDescription() {
		return this.description || SAMPLE_CARD_DESCRIPTION;
	}

	get previewSiteName() {
		return this.siteName || previewHost(this.url);
	}

	setTitle = (event: Event) => {
		this.title = (event.target as HTMLInputElement).value;
	};

	setDescription = (event: Event) => {
		this.description = (event.target as HTMLTextAreaElement).value;
	};

	setUrl = (event: Event) => {
		this.url = (event.target as HTMLInputElement).value;
	};

	setImage = (event: Event) => {
		this.image = (event.target as HTMLInputElement).value;
	};

	setSiteName = (event: Event) => {
		this.siteName = (event.target as HTMLInputElement).value;
	};

	setTwitterHandle = (event: Event) => {
		this.twitterHandle = (event.target as HTMLInputElement).value;
	};

	togglePreview = () => {
		this.showPreview = !this.showPreview;
	};

	copy = async () => {
		await navigator.clipboard.writeText(this.tags);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	copyTags = () => void this.copy();

	<template>
		<div class="dt-meta">
			<div class="dt-meta-form">
				<div class="dt-meta-field">
					<div class="dt-meta-head">
						<label for="dt-meta-title">Page
							Title</label>
						<span
							class="dt-meta-count
								{{if
									this.titleOver
									'is-over'
								}}"
						>{{this.titleCount}}</span>
					</div>
					<input
						id="dt-meta-title"
						type="text"
						class="dt-meta-input is-tall"
						value={{this.title}}
						placeholder="My Awesome Website"
						{{on "input" this.setTitle}}
					/>
				</div>

				<div class="dt-meta-field">
					<div class="dt-meta-head">
						<label
							for="dt-meta-description"
						>Description</label>
						<span
							class="dt-meta-count
								{{if
									this.descriptionOver
									'is-over'
								}}"
						>{{this.descriptionCount}}</span>
					</div>
					<textarea
						id="dt-meta-description"
						class="dt-meta-textarea"
						value={{this.description}}
						placeholder="A brief description of your page..."
						{{on
							"input"
							this.setDescription
						}}
					></textarea>
				</div>

				<div class="dt-meta-field">
					<div class="dt-meta-head">
						<label
							for="dt-meta-url"
						>URL</label>
					</div>
					<input
						id="dt-meta-url"
						type="text"
						class="dt-meta-input is-mono"
						value={{this.url}}
						placeholder="https://example.com"
						{{on "input" this.setUrl}}
					/>
				</div>

				<div class="dt-meta-field">
					<div class="dt-meta-head">
						<label for="dt-meta-image">Image
							URL</label>
					</div>
					<input
						id="dt-meta-image"
						type="text"
						class="dt-meta-input is-mono"
						value={{this.image}}
						placeholder="https://example.com/og-image.jpg"
						{{on "input" this.setImage}}
					/>
					<p class="dt-meta-note">Recommended
						size: 1200×630px</p>
				</div>

				<div class="dt-meta-row">
					<div class="dt-meta-field">
						<div class="dt-meta-head">
							<label
								for="dt-meta-site"
							>Site Name</label>
						</div>
						<input
							id="dt-meta-site"
							type="text"
							class="dt-meta-input"
							value={{this.siteName}}
							placeholder="My Website"
							{{on
								"input"
								this.setSiteName
							}}
						/>
					</div>
					<div class="dt-meta-field">
						<div class="dt-meta-head">
							<label
								for="dt-meta-twitter"
							>Twitter Handle</label>
						</div>
						<input
							id="dt-meta-twitter"
							type="text"
							class="dt-meta-input"
							value={{this.twitterHandle}}
							placeholder={{TWITTER_PLACEHOLDER}}
							{{on
								"input"
								this.setTwitterHandle
							}}
						/>
					</div>
				</div>
			</div>

			<div class="dt-meta-output">
				<div class="dt-meta-output-head">
									<span>Generated Meta Tags</span>
				</div>
				<pre class="dt-meta-code">{{this.tags}}</pre>
			</div>

			<div class="dt-meta-actions">
				<button
					type="button"
					class="dt-meta-copy"
					{{on "click" this.copyTags}}
				>
					<Icon
						@name={{if
							this.copied
							"check"
							"copy"
						}}
					/>
					{{if
						this.copied
						"Copied to clipboard!"
						"Copy Meta Tags"
					}}
				</button>
				<button
					type="button"
					class="dt-meta-toggle"
					{{on "click" this.togglePreview}}
				>
					<Icon
						@name={{if
							this.showPreview
							"eye-off"
							"eye"
						}}
					/>
					{{if
						this.showPreview
						"Hide Preview"
						"Preview"
					}}
				</button>
			</div>

			{{#if this.showPreview}}
				<div class="dt-meta-previews">
					<div class="dt-meta-preview">
						<span
							class="dt-meta-preview-label"
						>Google</span>
						<div class="dt-meta-serp">
							<span
								class="dt-meta-serp-title"
							>{{this.previewTitle}}</span>
							<span
								class="dt-meta-serp-url"
							>{{this.previewUrl}}</span>
							<span
								class="dt-meta-serp-desc"
							>{{this.previewDescription}}</span>
						</div>
					</div>

					<div class="dt-meta-preview is-card">
						<span
							class="dt-meta-preview-label"
						>Social Card</span>
						<div class="dt-meta-card">
							<div
								class="dt-meta-card-image"
							>
								{{#if
									this.image
								}}
									<img
										src={{this.image}}
										alt="Preview"
									/>
								{{else}}
									<span>No
										image</span>
								{{/if}}
							</div>
							<div
								class="dt-meta-card-body"
							>
								<span
									class="dt-meta-card-host"
								>{{this.previewSiteName}}</span>
								<span
									class="dt-meta-card-title"
								>{{this.previewTitle}}</span>
								<span
									class="dt-meta-card-desc"
								>{{this.cardDescription}}</span>
							</div>
						</div>
					</div>
				</div>
			{{/if}}
		</div>
	</template>
}
