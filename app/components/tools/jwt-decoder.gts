import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { decodeJwt, type JwtResult } from 'delphitools-v2/lib/jwt';

type Decoded = Extract<JwtResult, { kind: 'decoded' }>;
type Malformed = Extract<JwtResult, { kind: 'segments' }>;

const COPIED_MS = 1500;

interface ClaimRow {
	key: string;
	label: string;
	absolute: string;
	showExpiredBadge: boolean;
}

export default class JwtDecoderTool extends Component {
	@tracked token = '';
	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get result(): JwtResult {
		return decodeJwt(this.token);
	}

	get decoded(): Decoded | null {
		return this.result.kind === 'decoded' ? this.result : null;
	}

	get malformed(): Malformed | null {
		return this.result.kind === 'segments' ? this.result : null;
	}

	get hasInput(): boolean {
		return this.result.kind !== 'empty';
	}

	get segmentCountLabel(): string | null {
		if (!this.hasInput) return null;
		const result = this.result;
		return result.kind === 'segments' ? `${result.found}` : '3';
	}

	get algorithmLabel(): string | null {
		const decoded = this.decoded;
		if (!decoded) return null;
		return decoded.header.error ?? decoded.algorithm ?? '—';
	}

	get typeLabel(): string | null {
		const decoded = this.decoded;
		if (!decoded) return null;
		return decoded.header.error ?? decoded.tokenType ?? '—';
	}

	get signatureLabel(): string | null {
		const decoded = this.decoded;
		if (!decoded) return null;
		const signature = decoded.signature;
		return signature.error ?? `${signature.bytes} bytes`;
	}

	get expClaim() {
		return (
			this.decoded?.timeClaims.find(
				(claim) => claim.key === 'exp',
			) ?? null
		);
	}

	get statusLabel(): string | null {
		if (!this.decoded) return null;
		const exp = this.expClaim;
		if (!exp) return '—';
		return exp.past ? 'Expired' : 'Valid';
	}

	get statusIsExpired(): boolean {
		return this.decoded !== null && (this.expClaim?.past ?? false);
	}

	get claimRows(): ClaimRow[] {
		return (this.decoded?.timeClaims ?? []).map((claim) => ({
			key: claim.key,
			label: claim.label,
			absolute: claim.absolute,
			showExpiredBadge: claim.key === 'exp' && claim.past,
		}));
	}

	get headerMeta(): string {
		const header = this.decoded?.header;
		if (!header) return '—';
		return header.error ?? `${header.bytes} bytes`;
	}

	get payloadMeta(): string {
		const payload = this.decoded?.payload;
		if (!payload) return '—';
		return payload.error ?? `${payload.bytes} bytes`;
	}

	setToken = (event: Event) => {
		this.token = (event.target as HTMLTextAreaElement).value;
	};

	clear = () => {
		this.token = '';
	};

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
		<div class="dt-jwt">
			<div class="dt-jwt-frame">
				<div class="dt-jwt-bar">
					<Icon @name="key-square" />
					<span class="dt-jwt-name">JWT Decoder</span>
					{{#if this.segmentCountLabel}}
						<span
							class="dt-jwt-meta"
						>{{this.segmentCountLabel}}
							segments</span>
					{{/if}}
					<div class="dt-jwt-bar-tools">
						<button
							type="button"
							class="dt-jwt-btn"
							aria-label="Clear"
							disabled={{unless
								this.hasInput
								true
							}}
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="x" />
						</button>
					</div>
				</div>

				<div class="dt-jwt-field">
					<label
						class="dt-jwt-label"
						for="dt-jwt-on"
					>Token</label>
					<textarea
						id="dt-jwt-on"
						class="dt-jwt-area"
						rows="5"
						placeholder="Paste a JWT"
						spellcheck="false"
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						value={{this.token}}
						{{on "input" this.setToken}}
					></textarea>
				</div>

				{{#if this.malformed}}
					<div class="dt-jwt-banner">
						<span
							class="dt-jwt-banner-label"
						>Segments</span>
						<span
							class="dt-jwt-banner-value"
						>{{this.malformed.found}}
							/ 3</span>
					</div>
				{{/if}}

				{{#if this.decoded}}
					<div class="dt-jwt-settings">
						<div class="dt-jwt-cell">
							<span>Algorithm</span>
							<span
								class="dt-jwt-cell-value"
							>{{this.algorithmLabel}}</span>
						</div>
						<div class="dt-jwt-cell">
							<span>Type</span>
							<span
								class="dt-jwt-cell-value"
							>{{this.typeLabel}}</span>
						</div>
						<div class="dt-jwt-cell">
							<span>Signature</span>
							<span
								class="dt-jwt-cell-value"
							>{{this.signatureLabel}}</span>
						</div>
						<div class="dt-jwt-cell">
							<span>Status</span>
							<span
								class="dt-jwt-cell-value
									{{if
										this.statusIsExpired
										'is-destructive'
									}}"
							>{{this.statusLabel}}</span>
						</div>
					</div>

					{{#if this.claimRows.length}}
						<div class="dt-jwt-claims">
							{{#each
								this.claimRows
								as |claim|
							}}
								<div
									class="dt-jwt-claim
										{{if
											claim.showExpiredBadge
											'is-destructive'
										}}"
								>
									<span
										class="dt-jwt-claim-label"
									>{{claim.label}}</span>
									<span
										class="dt-jwt-claim-value"
									>{{claim.absolute}}</span>
									{{#if
										claim.showExpiredBadge
									}}
										<span
											class="dt-jwt-badge"
										>Expired</span>
									{{/if}}
								</div>
							{{/each}}
						</div>
					{{/if}}

					<div class="dt-jwt-panes">
						<section class="dt-jwt-pane">
							<div
								class="dt-jwt-pane-head"
							>
								<span
									class="dt-jwt-pane-label"
								>Header</span>
								<span
									class="dt-jwt-pane-meta"
								>{{this.headerMeta}}</span>
								{{#if
									this.decoded.header.pretty
								}}
									<button
										type="button"
										class="dt-jwt-copy"
										aria-label="Copy header"
										{{on
											"click"
											(fn
												this.copyValue
												this.decoded.header.pretty
												"header"
											)
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													"header"
												)
												"check"
												"copy"
											}}
										/>
									</button>
								{{/if}}
							</div>
							{{#if
								this.decoded.header.pretty
							}}
								<pre
									class="dt-jwt-json"
								>{{this.decoded.header.pretty}}</pre>
							{{else}}
								<p
									class="dt-jwt-err"
								>{{this.decoded.header.error}}</p>
							{{/if}}
						</section>

						<section class="dt-jwt-pane">
							<div
								class="dt-jwt-pane-head"
							>
								<span
									class="dt-jwt-pane-label"
								>Payload</span>
								<span
									class="dt-jwt-pane-meta"
								>{{this.payloadMeta}}</span>
								{{#if
									this.decoded.payload.pretty
								}}
									<button
										type="button"
										class="dt-jwt-copy"
										aria-label="Copy payload"
										{{on
											"click"
											(fn
												this.copyValue
												this.decoded.payload.pretty
												"payload"
											)
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													"payload"
												)
												"check"
												"copy"
											}}
										/>
									</button>
								{{/if}}
							</div>
							{{#if
								this.decoded.payload.pretty
							}}
								<pre
									class="dt-jwt-json"
								>{{this.decoded.payload.pretty}}</pre>
							{{else}}
								<p
									class="dt-jwt-err"
								>{{this.decoded.payload.error}}</p>
							{{/if}}
						</section>

						<section
							class="dt-jwt-pane is-full"
						>
							<div
								class="dt-jwt-pane-head"
							>
								<span
									class="dt-jwt-pane-label"
								>Signature</span>
								<span
									class="dt-jwt-pane-meta"
								>{{this.signatureLabel}}</span>
								{{#unless
									this.decoded.signature.error
								}}
									<button
										type="button"
										class="dt-jwt-copy"
										aria-label="Copy signature"
										{{on
											"click"
											(fn
												this.copyValue
												this.decoded.signature.raw
												"signature"
											)
										}}
									>
										<Icon
											@name={{if
												(eq
													this.copied
													"signature"
												)
												"check"
												"copy"
											}}
										/>
									</button>
								{{/unless}}
							</div>
							{{#if
								this.decoded.signature.error
							}}
								<p
									class="dt-jwt-err"
								>{{this.decoded.signature.error}}</p>
							{{else}}
								<p
									class="dt-jwt-sig"
								>{{this.decoded.signature.raw}}</p>
							{{/if}}
						</section>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
