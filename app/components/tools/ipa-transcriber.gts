import Component from '@glimmer/component';
import { tracked, cached } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadText } from 'delphitools-v2/lib/download';
import {
	loadCoreDictionary,
	loadFullDictionary,
} from 'delphitools-v2/lib/shavian/dictionary';
import type { Dictionary } from 'delphitools-v2/lib/shavian/transliterate';
import { transcribe, toText, type IpaToken } from 'delphitools-v2/lib/ipa';

// wording carried over from the Shavian tool
const DEFAULT_TEXT = 'Mankind, be vigilant; we loved you.';
// wording carried over from the Shavian tool
const CORE_ONLY_STATUS = 'Core dictionary only, uncommon words are guessed';
const COPIED_MS = 2000;

type DictStatus = 'loading-core' | 'loading-full' | 'core-only' | 'ready';

export default class IpaTranscriberTool extends Component {
	@tracked input = DEFAULT_TEXT;
	@tracked dictStatus: DictStatus = 'loading-core';
	@tracked copied = false;
	@tracked core: Dictionary = new Map();
	@tracked full: Dictionary = new Map();

	#copiedTimer?: ReturnType<typeof setTimeout>;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		void this.#loadDictionaries();
	}

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	async #loadDictionaries() {
		const core = await loadCoreDictionary();
		if (this.isDestroyed) return;
		this.core = core;
		this.dictStatus = 'loading-full';
		try {
			const full = await loadFullDictionary();
			if (this.isDestroyed) return;
			this.full = full;
			this.dictStatus = 'ready';
		} catch (error) {
			console.error(
				'ipa full dictionary failed to load:',
				error,
			);
			if (this.isDestroyed) return;
			this.dictStatus = 'core-only';
		}
	}

	get coreOnlyStatus() {
		return CORE_ONLY_STATUS;
	}

	@cached
	get tokens(): IpaToken[] {
		if (this.dictStatus === 'loading-core') return [];
		const { core, full } = this;
		return transcribe(
			this.input,
			(word) => full.get(word) ?? core.get(word),
		);
	}

	get hasContent() {
		return this.tokens.some((token) => token.type === 'word');
	}

	get text() {
		return `/${toText(this.tokens)}/`;
	}

	setInput = (event: Event) => {
		this.input = (event.target as HTMLTextAreaElement).value;
	};

	copy = () => {
		void navigator.clipboard.writeText(this.text);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	download = () => downloadText(this.text, 'ipa.txt');

	<template>
		<div class="dt-ipa">
			<div class="dt-ipa-frame">
				<div class="dt-ipa-input-pane">
					<div class="dt-ipa-pane-head">
						{{! wording carried over from the Shavian tool }}
						<span
							class="dt-ipa-label"
						>English input</span>
					</div>
					{{! wording carried over from the Shavian tool }}
					<textarea
						class="dt-ipa-input"
						aria-label="English input"
						placeholder="Type or paste English text here..."
						value={{this.input}}
						{{on "input" this.setInput}}
					></textarea>
				</div>

				<div>
					<div class="dt-ipa-pane-head is-split">
						<span
							class="dt-ipa-label"
						>IPA</span>
						{{#if
							(eq
								this.dictStatus
								"loading-core"
							)
						}}
							<span
								class="dt-ipa-status"
							>
								<NdsLoader />
								{{! wording carried over from the Shavian tool }}
								Loading
								dictionary…
							</span>
						{{else if
							(eq
								this.dictStatus
								"loading-full"
							)
						}}
							<span
								class="dt-ipa-status"
							>
								<NdsLoader />
								{{! wording carried over from the Shavian tool }}
								Loading full
								dictionary…
							</span>
						{{else if
							(eq
								this.dictStatus
								"core-only"
							)
						}}
							<span
								class="dt-ipa-status is-degraded"
							>
								<Icon
									@name="triangle-alert"
								/>
								{{this.coreOnlyStatus}}
							</span>
						{{else}}
							{{! wording carried over from the Shavian tool }}
							<span
								class="dt-ipa-status is-ready"
							>Dictionary ready</span>
						{{/if}}
					</div>

					<div class="dt-ipa-output">
						{{#if this.hasContent}}
							<p
								class="dt-ipa-text"
							>/{{~#each
									this.tokens
									as |token|
								~}}
									{{~#if
										(eq
											token.type
											"word"
										)
									~}}
										<span
											class="dt-ipa-word
												{{if
													token.guess
													'is-guess'
												}}"
											title={{token.value}}
										>{{token.ipa}}</span>
									{{~else~}}
										{{~token.value~}}
									{{~/if~}}
								{{~/each~}}/</p>
						{{/if}}
					</div>

					<div class="dt-ipa-legend">
						<span
							class="dt-ipa-legend-item"
						>
							<span
								class="dt-ipa-dot is-dict"
							></span>
							{{! wording carried over from the Shavian tool }}
							Dictionary match
						</span>
						<span
							class="dt-ipa-legend-item"
						>
							<span
								class="dt-ipa-dot is-guess"
							></span>
							{{! wording carried over from the Shavian tool }}
							Heuristic guess
						</span>
					</div>
				</div>

				{{#if this.hasContent}}
					<div class="dt-ipa-actions">
						<button
							type="button"
							class="dt-ipa-copy"
							{{on "click" this.copy}}
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
								"Copied"
								"Copy"
							}}
						</button>
						<button
							type="button"
							class="dt-ipa-download"
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel />
						</button>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
