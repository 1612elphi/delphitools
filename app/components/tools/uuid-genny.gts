import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import Switch from 'delphitools-v2/components/ui/switch';
import {
	clampCount,
	formatIdentifier,
	generateIdentifier,
	generateIdentifiers,
	IDENTIFIER_KINDS,
	type IdentifierKind,
} from 'delphitools-v2/lib/uuid';

const COPIED_MS = 1500;
const DEFAULT_COUNT = 10;

interface IdRow {
	raw: string;
	text: string;
}

export default class UuidGeneratorTool extends Component {
	@tracked kind: IdentifierKind = 'uuid4';
	@tracked count = DEFAULT_COUNT;
	@tracked uppercase = false;
	@tracked stripHyphens = false;
	@tracked ids: string[];
	@tracked copiedId: string | null = null;
	@tracked copiedAll = false;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		this.ids = generateIdentifiers(this.kind, this.count);
	}

	get kinds() {
		return IDENTIFIER_KINDS;
	}

	get isUuid() {
		return this.kind !== 'nanoid';
	}

	get kindLabel() {
		return (
			IDENTIFIER_KINDS.find((kind) => kind.id === this.kind)
				?.label ?? this.kind
		);
	}

	// toggles never regenerate ids
	get rows(): IdRow[] {
		const options = {
			uppercase: this.uppercase,
			stripHyphens: this.stripHyphens,
		};
		return this.ids.map((raw) => ({
			raw,
			text: formatIdentifier(raw, this.kind, options),
		}));
	}

	setKind = (kind: IdentifierKind) => {
		if (kind === this.kind) return;
		this.kind = kind;
		this.regenerate();
	};

	setCount = (event: Event) => {
		const parsed = parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (!Number.isFinite(parsed)) return;
		this.count = clampCount(parsed);
		this.#resize();
	};

	// resize keeps copied ids
	#resize() {
		if (this.ids.length >= this.count) {
			this.ids = this.ids.slice(0, this.count);
			return;
		}
		this.ids = [
			...this.ids,
			...Array.from(
				{ length: this.count - this.ids.length },
				() => generateIdentifier(this.kind),
			),
		];
	}

	setUppercase = (checked: boolean) => {
		this.uppercase = checked;
	};

	setStripHyphens = (checked: boolean) => {
		this.stripHyphens = checked;
	};

	regenerate = () => {
		this.ids = generateIdentifiers(this.kind, this.count);
	};

	#flash() {
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(() => {
			this.copiedId = null;
			this.copiedAll = false;
		}, COPIED_MS);
	}

	copyRow = async (row: IdRow) => {
		await navigator.clipboard.writeText(row.text);
		this.copiedId = row.raw;
		this.#flash();
	};

	copyAll = async () => {
		await navigator.clipboard.writeText(
			this.rows.map((row) => row.text).join('\n'),
		);
		this.copiedAll = true;
		this.#flash();
	};

	<template>
		<div class="dt-uuid">
			<div class="dt-uuid-frame">
				<div class="dt-uuid-bar">
					<div class="dt-uuid-info">
						<p class="dt-uuid-name">
							{{this.kindLabel}}
						</p>
						<p class="dt-uuid-meta">
							{{this.ids.length}}
							generated
						</p>
					</div>
					<div
						class="segmented dt-uuid-kinds"
						aria-label="Kind"
					>
						{{#each
							this.kinds key="id"
							as |kind|
						}}
							<button
								type="button"
								class="dt-uuid-kind
									{{if
										(eq
											this.kind
											kind.id
										)
										'is-active'
									}}"
								aria-pressed={{if
									(eq
										this.kind
										kind.id
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.setKind
										kind.id
									)
								}}
							>
								{{kind.label}}
							</button>
						{{/each}}
					</div>
					<button
						type="button"
						class="dt-uuid-btn
							{{if
								this.copiedAll
								'is-copied'
							}}"
						{{on "click" this.copyAll}}
					>
						<Icon
							@name={{if
								this.copiedAll
								"check"
								"copy"
							}}
						/>
						Copy all
					</button>
					<button
						type="button"
						class="dt-uuid-btn is-primary"
						{{on "click" this.regenerate}}
					>
						<Icon @name="refresh-cw" />
						Regenerate
					</button>
				</div>

				<div class="dt-uuid-settings">
					<label class="dt-uuid-field">
						<span>Count</span>
						<input
							type="number"
							min="1"
							max="100"
							value={{this.count}}
							{{on
								"input"
								this.setCount
							}}
						/>
					</label>
					{{#if this.isUuid}}
						<div class="dt-uuid-field">
							<span>Options</span>
							<div
								class="dt-uuid-options"
							>
								<label
									class="dt-uuid-option"
								>
									<Switch
										@checked={{this.uppercase}}
										@onChange={{this.setUppercase}}
										@label="Uppercase"
									/>
									<span
									>Uppercase</span>
								</label>
								<label
									class="dt-uuid-option"
								>
									<Switch
										@checked={{this.stripHyphens}}
										@onChange={{this.setStripHyphens}}
										@label="Strip hyphens"
									/>
									<span
									>Strip
										hyphens</span>
								</label>
							</div>
						</div>
					{{/if}}
				</div>

				<div>
					{{#each this.rows key="raw" as |row|}}
						<div class="dt-uuid-row">
							<span
								class="dt-uuid-value"
							>{{row.text}}</span>
							<button
								type="button"
								class="dt-uuid-copy
									{{if
										(eq
											this.copiedId
											row.raw
										)
										'is-copied'
									}}"
								title="Copy"
								{{on
									"click"
									(fn
										this.copyRow
										row
									)
								}}
							>
								<Icon
									@name={{if
										(eq
											this.copiedId
											row.raw
										)
										"check"
										"copy"
									}}
								/>
							</button>
						</div>
					{{/each}}
				</div>
			</div>
		</div>
	</template>
}
