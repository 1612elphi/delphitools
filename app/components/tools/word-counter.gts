import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from 'delphitools-v2/components/icon';

export interface TextStats {
	words: number;
	characters: number;
	charactersNoSpaces: number;
	sentences: number;
	paragraphs: number;
	lines: number;
	readingTime: string;
	speakingTime: string;
}

const READING_WPM = 200;
const SPEAKING_WPM = 150;
const COPIED_MS = 1500;

// formatter wraps long attribute values
const PLACEHOLDER = 'Start typing or paste your text here...';

// < 1 min reads as seconds
function pace(words: number, wordsPerMinute: number): string {
	const minutes = words / wordsPerMinute;
	return minutes < 1
		? `${Math.ceil(minutes * 60)} sec`
		: `${Math.ceil(minutes)} min`;
}

export function countText(text: string): TextStats {
	const trimmed = text.trim();

	const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
	const sentences = trimmed
		? trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0)
				.length
		: 0;
	const paragraphs = trimmed
		? trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
				.length
		: 0;

	return {
		words,
		characters: text.length,
		charactersNoSpaces: text.replace(/\s/g, '').length,
		sentences,
		paragraphs,
		// empty text = 0 lines
		lines: text ? text.split(/\n/).length : 0,
		readingTime: pace(words, READING_WPM),
		speakingTime: pace(words, SPEAKING_WPM),
	};
}

export function statsReport(stats: TextStats): string {
	return `Words: ${stats.words}
Characters: ${stats.characters}
Characters (no spaces): ${stats.charactersNoSpaces}
Sentences: ${stats.sentences}
Paragraphs: ${stats.paragraphs}
Lines: ${stats.lines}
Reading time: ${stats.readingTime}
Speaking time: ${stats.speakingTime}`;
}

export default class WordCounterTool extends Component {
	@tracked text = '';
	@tracked copied = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get stats() {
		return countText(this.text);
	}

	get isEmpty() {
		return this.text.length === 0;
	}

	get placeholder() {
		return PLACEHOLDER;
	}

	get primary() {
		const stats = this.stats;
		return [
			{ key: 'words', label: 'Words', value: stats.words },
			{
				key: 'characters',
				label: 'Characters',
				value: stats.characters,
			},
			{
				key: 'sentences',
				label: 'Sentences',
				value: stats.sentences,
			},
			{
				key: 'paragraphs',
				label: 'Paragraphs',
				value: stats.paragraphs,
			},
		];
	}

	get secondary() {
		const stats = this.stats;
		return [
			{
				key: 'no-spaces',
				label: 'No spaces',
				value: String(stats.charactersNoSpaces),
			},
			{
				key: 'lines',
				label: 'Lines',
				value: String(stats.lines),
			},
			{
				key: 'reading',
				label: 'Reading time',
				value: stats.readingTime,
			},
			{
				key: 'speaking',
				label: 'Speaking time',
				value: stats.speakingTime,
			},
		];
	}

	setText = (event: Event) => {
		this.text = (event.target as HTMLTextAreaElement).value;
	};

	clear = () => {
		this.text = '';
	};

	copyStats = () => void this.copy();

	async copy() {
		await navigator.clipboard.writeText(statsReport(this.stats));
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	}

	<template>
		<div class="dt-wc">
			<div class="segmented dt-wc-primary">
				{{#each this.primary key="key" as |stat|}}
					<div class="dt-wc-stat">
						<span
							class="dt-wc-stat-value"
						>{{stat.value}}</span>
						<span
							class="dt-wc-stat-label"
						>{{stat.label}}</span>
					</div>
				{{/each}}
			</div>

			<div class="dt-wc-text">
				<textarea
					class="dt-wc-input"
					aria-label="Text"
					placeholder={{this.placeholder}}
					value={{this.text}}
					{{on "input" this.setText}}
				></textarea>
			</div>

			<div class="segmented dt-wc-secondary">
				{{#each this.secondary key="key" as |stat|}}
					<div class="dt-wc-cell">
						<span
							class="dt-wc-cell-label"
						>{{stat.label}}</span>
						<span
							class="dt-wc-cell-value"
						>{{stat.value}}</span>
					</div>
				{{/each}}
			</div>

			<div class="dt-wc-actions">
				<button
					type="button"
					disabled={{this.isEmpty}}
					{{on "click" this.clear}}
				>
					<Icon @name="trash-2" />
					Clear
				</button>
				<button
					type="button"
					disabled={{this.isEmpty}}
					{{on "click" this.copyStats}}
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
						"Copied!"
						"Copy Stats"
					}}
				</button>
			</div>
		</div>
	</template>
}
