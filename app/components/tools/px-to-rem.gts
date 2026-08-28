import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';

export type Direction = 'px-to-rem' | 'rem-to-px';

const REFERENCE_PX = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

const DEFAULT_BASE = 16;
const COPIED_MS = 1500;

// strips toFixed padding; "10.0000" keeps its integer zeros
function trimZeros(value: string): string {
	return value.replace(/\.?0+$/, '');
}

export function pxToRem(px: number, base: number): string {
	return trimZeros((px / base).toFixed(4));
}

export function remToPx(rem: number, base: number): string {
	return trimZeros((rem * base).toFixed(2));
}

export default class PxToRemTool extends Component {
	@tracked pxValue = '';
	@tracked remValue = '';
	@tracked baseSize = String(DEFAULT_BASE);
	@tracked mode: Direction = 'px-to-rem';
	@tracked copied: 'px' | 'rem' | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get base() {
		return Number.parseFloat(this.baseSize) || DEFAULT_BASE;
	}

	get pxIsSource() {
		return this.mode === 'px-to-rem';
	}

	get pxReadOnly() {
		return !this.pxIsSource;
	}

	get remReadOnly() {
		return this.pxIsSource;
	}

	get pxCopied() {
		return this.copied === 'px';
	}

	get remCopied() {
		return this.copied === 'rem';
	}

	// next app wording
	get pxHeading() {
		return this.pxIsSource ? 'Pixels (input)' : 'Pixels (result)';
	}

	// next app wording
	get remHeading() {
		return this.pxIsSource ? 'REM (result)' : 'REM (input)';
	}

	get pxCopyLabel() {
		return `Copy ${this.pxValue}px`;
	}

	get remCopyLabel() {
		return `Copy ${this.remValue}rem`;
	}

	get refRemHeading() {
		return `rem (base ${this.base}px)`;
	}

	get reference() {
		const base = this.base;
		return REFERENCE_PX.map((px) => ({
			px,
			pxLabel: `${px}px`,
			remLabel: `${pxToRem(px, base)}rem`,
		}));
	}

	applyPx(value: string) {
		this.pxValue = value;
		const num = Number.parseFloat(value);
		this.remValue = Number.isNaN(num)
			? ''
			: pxToRem(num, this.base);
	}

	applyRem(value: string) {
		this.remValue = value;
		const num = Number.parseFloat(value);
		this.pxValue = Number.isNaN(num) ? '' : remToPx(num, this.base);
	}

	setPx = (event: Event) => {
		if (!this.pxIsSource) return;
		this.applyPx((event.target as HTMLInputElement).value);
	};

	setRem = (event: Event) => {
		if (this.pxIsSource) return;
		this.applyRem((event.target as HTMLInputElement).value);
	};

	// never rewrite the field being typed
	setBase = (event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		this.baseSize = value;
		const base = Number.parseFloat(value) || DEFAULT_BASE;

		if (this.pxIsSource && this.pxValue) {
			const num = Number.parseFloat(this.pxValue);
			if (!Number.isNaN(num))
				this.remValue = pxToRem(num, base);
		} else if (!this.pxIsSource && this.remValue) {
			const num = Number.parseFloat(this.remValue);
			if (!Number.isNaN(num))
				this.pxValue = remToPx(num, base);
		}
	};

	// fills px side; rem derives
	useReference = (px: number) => this.applyPx(String(px));

	toggleMode = () => {
		this.mode = this.pxIsSource ? 'rem-to-px' : 'px-to-rem';
	};

	copyPx = () => void this.copy(`${this.pxValue}px`, 'px');
	copyRem = () => void this.copy(`${this.remValue}rem`, 'rem');

	async copy(text: string, which: 'px' | 'rem') {
		await navigator.clipboard.writeText(text);
		this.copied = which;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	}

	<template>
		<div class="dt-ptr">
			<div class="dt-ptr-base">
				{{! next app wording }}
				<label
					class="dt-ptr-base-label"
					for="dt-ptr-base"
				>Base font size</label>
				<div class="dt-ptr-base-field">
					<input
						id="dt-ptr-base"
						type="number"
						value={{this.baseSize}}
						{{on "input" this.setBase}}
					/>
					<span class="dt-ptr-unit">px</span>
				</div>
			</div>

			<div class="dt-ptr-convert">
				<div class="dt-ptr-col">
					<div class="dt-ptr-col-head">
						<label
							for="dt-ptr-px"
						>{{this.pxHeading}}</label>
					</div>
					<div class="dt-ptr-field">
						<input
							id="dt-ptr-px"
							type="number"
							placeholder="0"
							readonly={{this.pxReadOnly}}
							value={{this.pxValue}}
							{{on
								"input"
								this.setPx
							}}
						/>
						<span
							class="dt-ptr-suffix"
						>px</span>
					</div>
					{{#if this.pxValue}}
						<button
							type="button"
							class="dt-ptr-copy"
							{{on
								"click"
								this.copyPx
							}}
						>
							<Icon
								@name={{if
									this.pxCopied
									"check"
									"copy"
								}}
							/>
							{{#if this.pxCopied}}
								Copied!
							{{else}}
								{{this.pxCopyLabel}}
							{{/if}}
						</button>
					{{/if}}
				</div>

				<div class="dt-ptr-swap">
					<button
						type="button"
						aria-label="Swap direction"
						{{on "click" this.toggleMode}}
					>
						<Icon
							@name="arrow-right-left"
						/>
					</button>
				</div>

				<div class="dt-ptr-col">
					<div class="dt-ptr-col-head">
						<label
							for="dt-ptr-rem"
						>{{this.remHeading}}</label>
					</div>
					<div class="dt-ptr-field">
						<input
							id="dt-ptr-rem"
							type="number"
							placeholder="0"
							readonly={{this.remReadOnly}}
							value={{this.remValue}}
							{{on
								"input"
								this.setRem
							}}
						/>
						<span
							class="dt-ptr-suffix"
						>rem</span>
					</div>
					{{#if this.remValue}}
						<button
							type="button"
							class="dt-ptr-copy"
							{{on
								"click"
								this.copyRem
							}}
						>
							<Icon
								@name={{if
									this.remCopied
									"check"
									"copy"
								}}
							/>
							{{#if this.remCopied}}
								Copied!
							{{else}}
								{{this.remCopyLabel}}
							{{/if}}
						</button>
					{{/if}}
				</div>
			</div>

			<div>
				<div class="dt-ptr-ref-head">
					{{! next app wording }}
					<span class="dt-ptr-heading">Quick
						Reference</span>
				</div>
				<div class="dt-ptr-ref-cols">
					<span>px</span>
					<span>{{this.refRemHeading}}</span>
				</div>
				{{#each this.reference key="px" as |row|}}
					<button
						type="button"
						class="dt-ptr-ref-row"
						{{on
							"click"
							(fn
								this.useReference
								row.px
							)
						}}
					>
						<span
							class="dt-ptr-ref-px"
						>{{row.pxLabel}}</span>
						<span
							class="dt-ptr-ref-rem"
						>{{row.remLabel}}</span>
					</button>
				{{/each}}
			</div>
		</div>
	</template>
}
