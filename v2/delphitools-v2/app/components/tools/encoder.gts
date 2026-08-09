import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';

export type EncodingMode = 'encode' | 'decode';

export interface HashRow {
	key: string;
	name: string;
	value: string;
}

const COPIED_MS = 1500;
const HASH_DEBOUNCE_MS = 300;

/**
 * crypto-js gave the Next app MD5 as well. Web Crypto implements no MD5 at any
 * digest name, so the row is gone rather than faked.
 */
export const HASH_ALGORITHMS: { key: string; name: string; digest: string }[] =
	[
		{ key: 'sha1', name: 'SHA-1', digest: 'SHA-1' },
		{ key: 'sha256', name: 'SHA-256', digest: 'SHA-256' },
		{ key: 'sha512', name: 'SHA-512', digest: 'SHA-512' },
	];

// Wording carried over from the Next app. Held here rather than inline in the
// template because the formatter wraps long attribute values, and a placeholder
// keeps the line break it is given.
const PLACEHOLDERS = {
	base64Encode: 'Enter text to encode...',
	base64Decode: 'Enter Base64 to decode...',
	urlEncode: 'Enter text to URL encode...',
	urlDecode: 'Enter URL-encoded text to decode...',
	hash: 'Enter text to generate hashes...',
};

/** Wording carried over from the Next app. */
const BASE64_DECODE_ERROR = 'Invalid Base64 string';
const BASE64_ENCODE_ERROR = 'Encoding error';
const URL_ERROR = 'Invalid input';

/**
 * The Next app spread the byte array into String.fromCharCode, which overflows
 * the argument limit and throws on roughly 100 kB of input.
 */
function binaryString(bytes: Uint8Array): string {
	let out = '';
	for (const byte of bytes) out += String.fromCharCode(byte);
	return out;
}

export function encodeBase64(text: string): string {
	return btoa(binaryString(new TextEncoder().encode(text)));
}

/** Throws when the input is not Base64; the caller reports that as an error. */
export function decodeBase64(text: string): string {
	const binary = atob(text.trim());
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

export function convertBase64(
	mode: EncodingMode,
	text: string,
): { output: string; error: string | null } {
	if (!text) return { output: '', error: null };
	try {
		return {
			output:
				mode === 'encode'
					? encodeBase64(text)
					: decodeBase64(text),
			error: null,
		};
	} catch {
		return {
			output: '',
			error:
				mode === 'decode'
					? BASE64_DECODE_ERROR
					: BASE64_ENCODE_ERROR,
		};
	}
}

/** decodeURIComponent throws on a stray `%`, which the Next app reported inline. */
export function convertUrl(mode: EncodingMode, text: string): string {
	if (!text) return '';
	try {
		return mode === 'encode'
			? encodeURIComponent(text)
			: decodeURIComponent(text);
	} catch {
		return URL_ERROR;
	}
}

export function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * crypto.subtle is only defined in a secure context, so an http origin other
 * than localhost gets no hashes at all.
 */
export async function hashAll(text: string): Promise<HashRow[]> {
	if (!globalThis.crypto?.subtle) return [];
	const bytes = new TextEncoder().encode(text);
	return Promise.all(
		HASH_ALGORITHMS.map(async (entry) => ({
			key: entry.key,
			name: entry.name,
			value: toHex(
				await globalThis.crypto.subtle.digest(
					entry.digest,
					bytes,
				),
			),
		})),
	);
}

export default class EncoderTool extends Component {
	@tracked base64Input = '';
	@tracked base64Mode: EncodingMode = 'encode';

	@tracked urlInput = '';
	@tracked urlMode: EncodingMode = 'encode';

	@tracked hashInput = '';
	@tracked hashes: HashRow[] = [];
	@tracked hashLoading = false;

	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;
	#hashTimer?: ReturnType<typeof setTimeout>;
	/** Guards against an earlier digest resolving after a later one. */
	#hashRun = 0;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
		clearTimeout(this.#hashTimer);
		this.#hashRun++;
	}

	get base64Result() {
		return convertBase64(this.base64Mode, this.base64Input);
	}

	get base64IsEncoding() {
		return this.base64Mode === 'encode';
	}

	get base64InputLabel() {
		return this.base64IsEncoding
			? 'Text to encode'
			: 'Base64 to decode';
	}

	get base64OutputLabel() {
		return this.base64IsEncoding ? 'Base64 output' : 'Decoded text';
	}

	get base64Placeholder() {
		return this.base64IsEncoding
			? PLACEHOLDERS.base64Encode
			: PLACEHOLDERS.base64Decode;
	}

	get base64SwitchLabel() {
		return this.base64IsEncoding
			? 'Switch to Decode'
			: 'Switch to Encode';
	}

	get base64Display() {
		return this.base64Result.error ?? this.base64Result.output;
	}

	get base64HasOutput() {
		return (
			this.base64Result.output !== '' &&
			!this.base64Result.error
		);
	}

	get urlIsEncoding() {
		return this.urlMode === 'encode';
	}

	get urlOutput() {
		return convertUrl(this.urlMode, this.urlInput);
	}

	get urlInputLabel() {
		return this.urlIsEncoding ? 'Text to encode' : 'URL to decode';
	}

	get urlOutputLabel() {
		return this.urlIsEncoding
			? 'URL-encoded output'
			: 'Decoded text';
	}

	get urlPlaceholder() {
		return this.urlIsEncoding
			? PLACEHOLDERS.urlEncode
			: PLACEHOLDERS.urlDecode;
	}

	get urlSwitchLabel() {
		return this.urlIsEncoding
			? 'Switch to Decode'
			: 'Switch to Encode';
	}

	get hashPlaceholder() {
		return PLACEHOLDERS.hash;
	}

	setBase64Input = (event: Event) => {
		this.base64Input = (event.target as HTMLTextAreaElement).value;
	};

	setBase64Mode = (mode: EncodingMode) => {
		this.base64Mode = mode;
	};

	// Swaps input and output, so the round trip continues from where it stopped.
	toggleBase64Mode = () => {
		this.base64Input = this.base64Result.output;
		this.base64Mode = this.base64IsEncoding ? 'decode' : 'encode';
	};

	setUrlInput = (event: Event) => {
		this.urlInput = (event.target as HTMLTextAreaElement).value;
	};

	setUrlMode = (mode: EncodingMode) => {
		this.urlMode = mode;
	};

	toggleUrlMode = () => {
		this.urlInput = this.urlOutput;
		this.urlMode = this.urlIsEncoding ? 'decode' : 'encode';
	};

	setHashInput = (event: Event) => {
		this.hashInput = (event.target as HTMLTextAreaElement).value;
		this.scheduleHashes();
	};

	scheduleHashes() {
		clearTimeout(this.#hashTimer);
		this.#hashRun++;

		if (!this.hashInput) {
			this.hashes = [];
			this.hashLoading = false;
			return;
		}

		this.hashLoading = true;
		this.#hashTimer = setTimeout(
			() => void this.runHashes(),
			HASH_DEBOUNCE_MS,
		);
	}

	async runHashes() {
		const run = ++this.#hashRun;
		const rows = await hashAll(this.hashInput);
		if (run !== this.#hashRun) return;
		this.hashes = rows;
		this.hashLoading = false;
	}

	copyValue = (value: string, key: string) => void this.copy(value, key);

	async copy(value: string, key: string) {
		await navigator.clipboard.writeText(value);
		this.copied = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	}

	<template>
		<div class="dt-enc">
			<Tabs @defaultValue="base64">
				<TabsList class="dt-enc-tabs">
					<TabsTrigger
						class="dt-enc-tab"
						@value="base64"
					>Base64</TabsTrigger>
					{{! wording carried over from the Next app }}
					<TabsTrigger
						class="dt-enc-tab"
						@value="url"
					>URL Encode</TabsTrigger>
					<TabsTrigger
						class="dt-enc-tab"
						@value="hash"
					>Hash</TabsTrigger>
				</TabsList>

				<div class="dt-enc-frame">
					<TabsContent
						class="dt-enc-panel"
						@value="base64"
					>
						<div class="dt-enc-section">
							<span
								class="dt-enc-label"
							>Mode</span>
							<div
								class="segmented dt-enc-modes"
							>
								<button
									type="button"
									class="dt-enc-mode
										{{if
											this.base64IsEncoding
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setBase64Mode
											"encode"
										)
									}}
								>Encode</button>
								<button
									type="button"
									class="dt-enc-mode
										{{unless
											this.base64IsEncoding
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setBase64Mode
											"decode"
										)
									}}
								>Decode</button>
							</div>
						</div>

						<div class="dt-enc-section">
							{{! wording carried over from the Next app }}
							<label
								class="dt-enc-label"
								for="dt-enc-base64-in"
							>{{this.base64InputLabel}}</label>
							<textarea
								id="dt-enc-base64-in"
								class="dt-enc-area"
								placeholder={{this.base64Placeholder}}
								value={{this.base64Input}}
								{{on
									"input"
									this.setBase64Input
								}}
							></textarea>
						</div>

						{{! wording carried over from the Next app }}
						<button
							type="button"
							class="dt-enc-switch"
							{{on
								"click"
								this.toggleBase64Mode
							}}
						>
							<Icon
								@name="arrow-right-left"
							/>
							{{this.base64SwitchLabel}}
						</button>

						<div
							class="dt-enc-section is-output"
						>
							<div
								class="dt-enc-head"
							>
								{{! wording carried over from the Next app }}
								<label
									class="dt-enc-label"
									for="dt-enc-base64-out"
								>{{this.base64OutputLabel}}</label>
								{{#if
									this.base64HasOutput
								}}
									<button
										type="button"
										class="dt-enc-copy"
										{{on
											"click"
											(fn
												this.copyValue
												this.base64Result.output
												"base64"
											)
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													"base64"
												)
												"check"
												"copy"
											}}
										/>
										Copy
									</button>
								{{/if}}
							</div>
							<textarea
								id="dt-enc-base64-out"
								class="dt-enc-area
									{{if
										this.base64Result.error
										'is-error'
									}}"
								readonly
								value={{this.base64Display}}
							></textarea>
						</div>

						{{#if this.base64HasOutput}}
							<button
								type="button"
								class="dt-enc-action"
								{{on
									"click"
									(fn
										this.copyValue
										this.base64Result.output
										"base64-btn"
									)
								}}
							>
								<Icon
									@name={{if
										(eq
											this.copied
											"base64-btn"
										)
										"check"
										"copy"
									}}
								/>
								{{! wording carried over from the Next app }}
								{{if
									(eq
										this.copied
										"base64-btn"
									)
									"Copied"
									"Copy Output"
								}}
							</button>
						{{/if}}
					</TabsContent>

					<TabsContent
						class="dt-enc-panel"
						@value="url"
					>
						<div class="dt-enc-section">
							<span
								class="dt-enc-label"
							>Mode</span>
							<div
								class="segmented dt-enc-modes"
							>
								<button
									type="button"
									class="dt-enc-mode
										{{if
											this.urlIsEncoding
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setUrlMode
											"encode"
										)
									}}
								>Encode</button>
								<button
									type="button"
									class="dt-enc-mode
										{{unless
											this.urlIsEncoding
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setUrlMode
											"decode"
										)
									}}
								>Decode</button>
							</div>
						</div>

						<div class="dt-enc-section">
							{{! wording carried over from the Next app }}
							<label
								class="dt-enc-label"
								for="dt-enc-url-in"
							>{{this.urlInputLabel}}</label>
							<textarea
								id="dt-enc-url-in"
								class="dt-enc-area"
								placeholder={{this.urlPlaceholder}}
								value={{this.urlInput}}
								{{on
									"input"
									this.setUrlInput
								}}
							></textarea>
						</div>

						{{! wording carried over from the Next app }}
						<button
							type="button"
							class="dt-enc-switch"
							{{on
								"click"
								this.toggleUrlMode
							}}
						>
							<Icon
								@name="arrow-right-left"
							/>
							{{this.urlSwitchLabel}}
						</button>

						<div
							class="dt-enc-section is-output"
						>
							<div
								class="dt-enc-head"
							>
								{{! wording carried over from the Next app }}
								<label
									class="dt-enc-label"
									for="dt-enc-url-out"
								>{{this.urlOutputLabel}}</label>
								{{#if
									this.urlOutput
								}}
									<button
										type="button"
										class="dt-enc-copy"
										{{on
											"click"
											(fn
												this.copyValue
												this.urlOutput
												"url"
											)
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													"url"
												)
												"check"
												"copy"
											}}
										/>
										Copy
									</button>
								{{/if}}
							</div>
							<textarea
								id="dt-enc-url-out"
								class="dt-enc-area"
								readonly
								value={{this.urlOutput}}
							></textarea>
						</div>

						{{#if this.urlOutput}}
							<button
								type="button"
								class="dt-enc-action"
								{{on
									"click"
									(fn
										this.copyValue
										this.urlOutput
										"url-btn"
									)
								}}
							>
								<Icon
									@name={{if
										(eq
											this.copied
											"url-btn"
										)
										"check"
										"copy"
									}}
								/>
								{{! wording carried over from the Next app }}
								{{if
									(eq
										this.copied
										"url-btn"
									)
									"Copied"
									"Copy Output"
								}}
							</button>
						{{/if}}

						{{! wording carried over from the Next app }}
						<p class="dt-enc-note">Uses
							JavaScript's
							encodeURIComponent/decodeURIComponent</p>
					</TabsContent>

					<TabsContent
						class="dt-enc-panel"
						@value="hash"
					>
						<div class="dt-enc-section">
							{{! wording carried over from the Next app }}
							<label
								class="dt-enc-label"
								for="dt-enc-hash-in"
							>Text to hash</label>
							<textarea
								id="dt-enc-hash-in"
								class="dt-enc-area"
								placeholder={{this.hashPlaceholder}}
								value={{this.hashInput}}
								{{on
									"input"
									this.setHashInput
								}}
							></textarea>
						</div>

						{{#if this.hashLoading}}
							{{! wording carried over from the Next app }}
							<p
								class="dt-enc-status"
							>Generating hashes...</p>
						{{/if}}

						{{#if this.hashes.length}}
							<div
								class="dt-enc-hashes"
							>
								<div
									class="dt-enc-head"
								>
									{{! wording carried over from the Next app }}
									<span
										class="dt-enc-label"
									>Hash
										outputs</span>
								</div>
								{{#each
									this.hashes
									key="key"
									as |hash|
								}}
									<div
										class="dt-enc-hash"
									>
										<span
											class="dt-enc-hash-name"
										>{{hash.name}}</span>
										<code
											class="dt-enc-hash-value"
										>{{hash.value}}</code>
										<button
											type="button"
											class="dt-enc-hash-copy"
											aria-label="Copy
												{{hash.name}}"
											{{on
												"click"
												(fn
													this.copyValue
													hash.value
													hash.key
												)
											}}
										>
											<Icon
												@name={{if
													(eq
														this.copied
														hash.key
													)
													"check"
													"copy"
												}}
											/>
										</button>
									</div>
								{{/each}}
							</div>
						{{/if}}

						<div class="dt-enc-about">
							{{! wording carried over from the Next app }}
							<span
								class="dt-enc-label"
							>About Hash Functions</span>
							{{! wording carried over from the Next app }}
							<p><strong
								>SHA-1:</strong>
								160-bit,
								deprecated for
								security use.</p>
							{{! wording carried over from the Next app }}
							<p><strong
								>SHA-256:</strong>
								256-bit, secure
								for most
								applications.</p>
							{{! wording carried over from the Next app }}
							<p><strong
								>SHA-512:</strong>
								512-bit,
								strongest option
								here.</p>
						</div>
					</TabsContent>
				</div>
			</Tabs>
		</div>
	</template>
}
