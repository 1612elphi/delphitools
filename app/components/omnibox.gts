import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { htmlSafe } from '@ember/template';
import type { SafeString } from '@ember/template';
import { LinkTo } from '@ember/routing';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import ToolGrid from 'delphitools-v2/components/tool-grid';
import {
	homeFeatured,
	getToolById,
	toolCategories,
	type Tool,
	allTools,
} from 'delphitools-v2/lib/tools';
import {
	readInput,
	searchTools,
	toolsForFile,
	type OmniReading,
} from 'delphitools-v2/lib/omni';
import { HERO_ART } from 'delphitools-v2/lib/hero-art';
import WhatsNew from 'delphitools-v2/components/whats-new';
import ChangelogPopup from 'delphitools-v2/components/changelog-popup';

const PLACEHOLDER = 'Drop a file, search for a tool, paste in text';

const READ_DEFER_MS = 120;

interface AnswerRow {
	tool: Tool;
	value: string;
	swatches: { hex: string; style: SafeString }[];
	image?: string;
	query: Record<string, string>;
}

interface OmniboxSignature {
	Blocks: {
		default: [];
	};
}

function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

export default class Omnibox extends Component<OmniboxSignature> {
	@service declare router: RouterService;

	#picker: HTMLInputElement | null = null;

	@tracked raw = '';
	@tracked reading: OmniReading | null = null;
	@tracked file: File | null = null;
	@tracked fileTools: Tool[] = [];
	@tracked artIndex = Math.floor(Math.random() * HERO_ART.length);

	#readTimer?: ReturnType<typeof setTimeout>;
	#readToken = 0;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#readTimer);
	}

	get art() {
		return HERO_ART[this.artIndex] ?? HERO_ART[0]!;
	}

	get canShuffle() {
		return HERO_ART.length > 1;
	}

	get showArtBar() {
		return this.canShuffle || !!this.art.artist;
	}

	shuffle = () => {
		if (!this.canShuffle) return;
		let next = Math.floor(Math.random() * (HERO_ART.length - 1));
		if (next >= this.artIndex) next++;
		this.artIndex = next;
	};

	get isIdle() {
		return !this.raw.trim() && !this.file;
	}

	get isFiltering() {
		return !this.isIdle;
	}

	get answers(): AnswerRow[] {
		const rows: AnswerRow[] = [];
		for (const answer of this.reading?.answers ?? []) {
			const tool = getToolById(answer.toolId);
			if (!tool) continue;
			rows.push({
				tool,
				value: answer.value,
				swatches: (answer.swatches ?? []).map(
					(hex) => ({
						hex,
						// trusted generated hex
						style: htmlSafe(
							`background:${hex}`,
						),
					}),
				),
				image: answer.image,
				query: answer.query ?? {},
			});
		}
		return rows;
	}

	get carry(): Tool[] {
		return this.reading?.carry ?? [];
	}

	get carryQuery(): Record<string, string> {
		return this.reading?.carryQuery ?? {};
	}

	get carryLabel(): string {
		const colour = this.carryQuery['color'];
		return colour ? `→ #${colour}` : '';
	}

	get matches(): Tool[] {
		if (this.file) return this.fileTools;
		if (this.reading) return [];
		return searchTools(this.raw);
	}

	get showMatches() {
		return (
			this.file !== null ||
			(!this.reading && !!this.raw.trim())
		);
	}

	get fileMeta() {
		const file = this.file;
		if (!file) return '';
		const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE';
		return `${ext} · ${formatBytes(file.size)}`;
	}

	focusKey = modifier((element: HTMLInputElement) => {
		const onKeydown = (event: KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				event.key.toLowerCase() === 'k'
			) {
				event.preventDefault();
				element.focus();
				element.select();
			}
		};
		document.addEventListener('keydown', onKeydown);
		return () => document.removeEventListener('keydown', onKeydown);
	});

	setInput = (event: Event) => {
		this.raw = (event.target as HTMLInputElement).value;
		this.#scheduleRead();
	};

	#scheduleRead() {
		clearTimeout(this.#readTimer);
		this.#readTimer = setTimeout(() => {
			void this.#read();
		}, READ_DEFER_MS);
	}

	async #read() {
		const token = ++this.#readToken;
		const reading = await readInput(this.raw);
		if (this.isDestroyed || token !== this.#readToken) return;
		this.reading = reading;
	}

	takeFile = (file: File) => {
		this.raw = '';
		this.reading = null;
		this.file = file;
		this.fileTools = toolsForFile(file);
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file) this.takeFile(file);
	};

	// prevent dropped-file navigation
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	handlePaste = (event: ClipboardEvent) => {
		const file = event.clipboardData?.files[0];
		if (file) {
			event.preventDefault();
			this.takeFile(file);
		}
	};

	clearFile = () => {
		this.file = null;
		this.fileTools = [];
	};

	picker = modifier((element: HTMLInputElement) => {
		this.#picker = element;
		return () => {
			this.#picker = null;
		};
	});

	chooseFile = () => this.#picker?.click();

	pickFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.takeFile(file);
		input.value = '';
	};

	pasteClipboard = async () => {
		try {
			for (const item of await navigator.clipboard.read()) {
				const type = item.types.find(
					(t) => !t.startsWith('text/'),
				);
				if (!type) continue;
				const blob = await item.getType(type);
				const ext = type.split('/')[1] ?? 'bin';
				this.takeFile(
					new File([blob], `clipboard.${ext}`, {
						type,
					}),
				);
				return;
			}
			const text = await navigator.clipboard.readText();
			if (!text) return;
			this.clearFile();
			this.raw = text;
			this.#scheduleRead();
		} catch {}
	};

	feelingLucky = () => {
		const pool = allTools.filter((tool) => !tool.external);
		const tool = pool[Math.floor(Math.random() * pool.length)];
		if (!tool) return;
		if (tool.route) void this.router.transitionTo(tool.route);
		else void this.router.transitionTo('tools.tool', tool.id);
	};

	<template>
		<header class="dt-hero is-doodle">
			<div class="dt-hero-pills">
				<WhatsNew />
				<ChangelogPopup />
			</div>
			<img src={{this.art.src}} alt="" class="dt-hero-art" />
			<h1 class="dt-sr-only">delphitools</h1>
		</header>

		<div class="dt-omni-zone">
			<div
				class="dt-omni"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				{{#if this.file}}
					<div class="dt-omni-file">
						<div class="dt-omni-file-body">
							<Icon @name="file-up" />
							<span
								class="dt-omni-file-name"
							>{{this.file.name}}</span>
							<span
								class="dt-omni-file-meta"
							>{{this.fileMeta}}</span>
						</div>
						<button
							type="button"
							class="dt-omni-clear"
							{{on
								"click"
								this.clearFile
							}}
						>
							Clear
						</button>
					</div>
				{{else}}
					<div class="dt-omni-field">
						<Icon @name="search" />
						<input
							class="dt-omni-input"
							type="text"
							aria-label="Search tools"
							placeholder={{PLACEHOLDER}}
							value={{this.raw}}
							{{on
								"input"
								this.setInput
							}}
							{{on
								"paste"
								this.handlePaste
							}}
							{{this.focusKey}}
						/>
						<span
							class="dt-omni-kbd"
						>⌘K</span>
					</div>
					{{#if this.isIdle}}
						<div class="dt-omni-legend">
							<button
								type="button"
								class="dt-omni-legend-btn"
								{{on
									"click"
									this.chooseFile
								}}
							>
								<Icon
									@name="file-up"
								/>Choose a file
							</button>
							<input
								type="file"
								class="dt-omni-pick"
								aria-label="Choose a file"
								tabindex="-1"
								{{this.picker}}
								{{on
									"change"
									this.pickFile
								}}
							/>
							<button
								type="button"
								class="dt-omni-legend-btn"
								{{on
									"click"
									this.pasteClipboard
								}}
							>
								<Icon
									@name="clipboard-paste"
								/>Paste from
								clipboard
							</button>
							<button
								type="button"
								class="dt-omni-legend-btn"
								{{on
									"click"
									this.feelingLucky
								}}
							>
								<Icon
									@name="dices"
								/>I'm feeling
								lucky
							</button>
						</div>
					{{/if}}
				{{/if}}
			</div>

			{{#if this.answers.length}}
				<div class="dt-omni-answers">
					{{#each
						this.answers key="tool.id"
						as |row|
					}}
						<div class="dt-omni-row">
							<Icon
								@name={{row.tool.icon}}
							/>
							<span
								class="dt-omni-row-name"
							>{{row.tool.name}}</span>
							{{#if
								row.swatches.length
							}}
								<span
									class="dt-omni-swatches"
								>
									{{#each
										row.swatches
										key="hex"
										as |swatch|
									}}
										<i
											style={{swatch.style}}
										></i>
									{{/each}}
								</span>
							{{else if row.image}}
								<img
									src={{row.image}}
									alt=""
									class="dt-omni-thumb"
								/>
							{{else}}
								<span
									class="dt-omni-row-val"
								>{{row.value}}</span>
							{{/if}}
							<LinkTo
								@route="tools.tool"
								@model={{row.tool.id}}
								@query={{row.query}}
								class="dt-omni-open"
								aria-label={{row.tool.name}}
							>
								<Icon
									@name="arrow-right"
								/>
							</LinkTo>
						</div>
					{{/each}}
				</div>
			{{/if}}

			{{#if this.showArtBar}}
				<div class="dt-omni-artbar">
					{{#if this.art.artist}}
						{{#if this.art.url}}
							<a
								href={{this.art.url}}
								target="_blank"
								rel="noopener noreferrer"
								class="dt-omni-artist"
							>art by
								{{this.art.artist}}</a>
						{{else}}
							<span
								class="dt-omni-artist"
							>art by
								{{this.art.artist}}</span>
						{{/if}}
					{{else}}
						<span></span>
					{{/if}}
					{{#if this.canShuffle}}
						<button
							type="button"
							class="dt-omni-shuffle"
							{{on
								"click"
								this.shuffle
							}}
						>
							<Icon @name="shuffle" />
							shuffle
						</button>
					{{/if}}
				</div>
			{{/if}}

			{{yield}}
		</div>

		{{#if this.carry.length}}
			<section class="dt-section">
				<h2 class="dt-section-title">
					Takes a colour
					<span
						class="dt-section-count"
					>{{this.carry.length}}</span>
				</h2>
				<ToolGrid
					@tools={{this.carry}}
					@query={{this.carryQuery}}
					@carryLabel={{this.carryLabel}}
				/>
			</section>
		{{/if}}

		{{#if this.showMatches}}
			<section class="dt-section">
				<h2 class="dt-section-title">
					Matches
					<span
						class="dt-section-count"
					>{{this.matches.length}}</span>
				</h2>
				<ToolGrid @tools={{this.matches}} />
			</section>
		{{/if}}

		<div
			class="dt-omni-catalogue
				{{if this.isFiltering 'is-dimmed'}}"
		>

			<section class="dt-section">
				<h2 class="dt-section-title">
					Greatest Hits
					<span
						class="dt-section-count"
					>{{homeFeatured.length}}</span>
				</h2>
				<ToolGrid
					@tools={{homeFeatured}}
					class="is-featured"
				/>
			</section>

			{{#each toolCategories as |category|}}
				<section class="dt-section">
					<h2 class="dt-section-title">
						{{category.name}}
						<span
							class="dt-section-count"
						>{{category.tools.length}}</span>
					</h2>
					<ToolGrid @tools={{category.tools}} />
				</section>
			{{/each}}
		</div>
	</template>
}
