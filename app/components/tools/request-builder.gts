import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	METHODS,
	toCurl,
	toHttp,
	type Pair,
	type RequestSpec,
} from 'delphitools-v2/lib/request-builder';

const COPIED_MS = 2000;

type PairList = 'params' | 'headers';
type Output = 'curl' | 'http';

export default class RequestBuilderTool extends Component {
	@tracked method = 'GET';
	@tracked url = '';
	@tracked params: Pair[] = [];
	@tracked headers: Pair[] = [];
	@tracked body = '';
	@tracked copied: Output | '' = '';

	#timer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#timer);
	}

	get spec(): RequestSpec {
		return {
			method: this.method,
			url: this.url,
			params: this.params,
			headers: this.headers,
			body: this.body,
		};
	}

	get curl() {
		return toCurl(this.spec);
	}

	get http() {
		return toHttp(this.spec);
	}

	selectMethod = (method: string) => {
		this.method = method;
	};

	setUrl = (event: Event) => {
		this.url = (event.target as HTMLInputElement).value;
	};

	setBody = (event: Event) => {
		this.body = (event.target as HTMLTextAreaElement).value;
	};

	addPair = (list: PairList) => {
		this[list] = [...this[list], { key: '', value: '' }];
	};

	setPair = (
		list: PairList,
		index: number,
		field: keyof Pair,
		event: Event,
	) => {
		this[list] = this[list].map((pair, i) =>
			i === index
				? {
						...pair,
						[field]: (
							event.target as HTMLInputElement
						).value,
					}
				: pair,
		);
	};

	removePair = (list: PairList, index: number) => {
		this[list] = this[list].filter((_, i) => i !== index);
	};

	copy = (which: Output) => {
		void navigator.clipboard.writeText(
			which === 'curl' ? this.curl : this.http,
		);
		this.copied = which;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.copied = ''), COPIED_MS);
	};

	<template>
		<div class="dt-req-frame">
			<div class="segmented dt-req-methods">
				{{#each METHODS as |method|}}
					<button
						type="button"
						class="dt-req-method
							{{if
								(eq
									method
									this.method
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.selectMethod
								method
							)
						}}
					>{{method}}</button>
				{{/each}}
			</div>

			<input
				type="url"
				class="dt-req-url"
				aria-label="URL"
				placeholder="https://api.example.com/path"
				value={{this.url}}
				{{on "input" this.setUrl}}
			/>

			<div class="dt-req-sections">
				<section class="dt-req-section is-query">
					<div class="dt-req-section-head">
						<span
							class="dt-req-label"
						>Query</span>
						<button
							type="button"
							class="dt-req-add"
							{{on
								"click"
								(fn
									this.addPair
									"params"
								)
							}}
						>
							<Icon @name="plus" />
							Add
						</button>
					</div>
					{{#each
						this.params key="@index"
						as |pair index|
					}}
						<div class="dt-req-row">
							<input
								class="dt-req-cell"
								aria-label="Name"
								placeholder="key"
								value={{pair.key}}
								{{on
									"input"
									(fn
										this.setPair
										"params"
										index
										"key"
									)
								}}
							/>
							<input
								class="dt-req-cell"
								aria-label="Value"
								placeholder="value"
								value={{pair.value}}
								{{on
									"input"
									(fn
										this.setPair
										"params"
										index
										"value"
									)
								}}
							/>
							<button
								type="button"
								class="dt-req-remove"
								aria-label="Remove"
								{{on
									"click"
									(fn
										this.removePair
										"params"
										index
									)
								}}
							>
								<Icon
									@name="x"
								/>
							</button>
						</div>
					{{/each}}
				</section>

				<section class="dt-req-section is-headers">
					<div class="dt-req-section-head">
						<span
							class="dt-req-label"
						>Headers</span>
						<button
							type="button"
							class="dt-req-add"
							{{on
								"click"
								(fn
									this.addPair
									"headers"
								)
							}}
						>
							<Icon @name="plus" />
							Add
						</button>
					</div>
					{{#each
						this.headers key="@index"
						as |pair index|
					}}
						<div class="dt-req-row">
							<input
								class="dt-req-cell"
								aria-label="Name"
								placeholder="Header"
								value={{pair.key}}
								{{on
									"input"
									(fn
										this.setPair
										"headers"
										index
										"key"
									)
								}}
							/>
							<input
								class="dt-req-cell"
								aria-label="Value"
								placeholder="value"
								value={{pair.value}}
								{{on
									"input"
									(fn
										this.setPair
										"headers"
										index
										"value"
									)
								}}
							/>
							<button
								type="button"
								class="dt-req-remove"
								aria-label="Remove"
								{{on
									"click"
									(fn
										this.removePair
										"headers"
										index
									)
								}}
							>
								<Icon
									@name="x"
								/>
							</button>
						</div>
					{{/each}}
				</section>
			</div>

			<div class="dt-req-section-head is-body">
				<span class="dt-req-label">Body</span>
			</div>
			<textarea
				class="dt-req-body"
				aria-label="Body"
				value={{this.body}}
				{{on "input" this.setBody}}
			></textarea>

			<div class="dt-req-outs">
				<section class="dt-req-out is-curl">
					<div class="dt-req-out-head">
						<span
							class="dt-req-label"
						>cURL</span>
						<button
							type="button"
							class="dt-req-copy"
							{{on
								"click"
								(fn
									this.copy
									"curl"
								)
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"curl"
									)
									"check"
									"copy"
								}}
							/>
							{{if
								(eq
									this.copied
									"curl"
								)
								"Copied"
								"Copy"
							}}
						</button>
					</div>
					<pre
						class="dt-req-pre"
					>{{this.curl}}</pre>
				</section>

				<section class="dt-req-out is-http">
					<div class="dt-req-out-head">
						<span
							class="dt-req-label"
						>HTTP</span>
						<button
							type="button"
							class="dt-req-copy"
							{{on
								"click"
								(fn
									this.copy
									"http"
								)
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copied
										"http"
									)
									"check"
									"copy"
								}}
							/>
							{{if
								(eq
									this.copied
									"http"
								)
								"Copied"
								"Copy"
							}}
						</button>
					</div>
					<pre
						class="dt-req-pre"
					>{{this.http}}</pre>
				</section>
			</div>
		</div>
	</template>
}
