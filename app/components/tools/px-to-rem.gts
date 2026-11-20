import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import type { TOC } from '@ember/component/template-only';
import CanonBigNumberField from 'delphicanon/components/canon-big-number-field';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import press from 'delphicanon/modifiers/canon-press';
import { clamp, parseInteger } from 'delphicanon/lib/number';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	baseRange,
	commonPx,
	convert,
	format,
	nudged,
	parse,
} from 'delphitools-v2/components/tools/px-to-rem/rem';
import Specimen from 'delphitools-v2/components/tools/px-to-rem/specimen';
import './px-to-rem/px-to-rem.css';

const directions = ['PX → REM', 'REM → PX'];

const CopyIcon = <template><IconSvg @name="copy" /></template>;

interface ReferenceRowSignature {
	Args: { px: number; rem: string; current: boolean; onPick: () => void };
}

const ReferenceRow: TOC<ReferenceRowSignature> = <template>
	<button
		type="button"
		class="px-to-rem-row"
		aria-label="{{@px}}px, {{@rem}}rem"
		aria-current={{if @current "true"}}
		{{press}}
		{{on "click" @onPick}}
	>
		<span>{{@px}}px</span>
		<span class="px-to-rem-row-rem">{{@rem}}</span>
	</button>
</template>;

function upper(text: string) {
	return text.toUpperCase();
}

export default class PxToRem extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked text = '16';
	@tracked remToPixel = false;
	@tracked base: number = baseRange.start;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.text = query.get('pxValue') ?? '16';
		this.remToPixel = query.get('pxDirection') === '1';
		this.base = clamp(
			parseInteger(query.get('pxBase') ?? '') ??
				baseRange.start,
			baseRange.min,
			baseRange.max,
		);
	}

	get inputUnit() {
		return this.remToPixel ? 'rem' : 'px';
	}

	get outputUnit() {
		return this.remToPixel ? 'px' : 'rem';
	}

	resultOf(text: string) {
		return convert(
			parse(text, this.inputUnit),
			this.base,
			this.remToPixel,
		);
	}

	get result() {
		return this.resultOf(this.text);
	}

	get pixels() {
		const typed = parse(this.text, this.inputUnit);
		if (typed === undefined) return undefined;
		return this.remToPixel ? typed * this.base : typed;
	}

	get figure() {
		const { result } = this;
		return result === undefined
			? { text: '—', unit: '' }
			: { text: format(result), unit: this.outputUnit };
	}

	get copyDisabled() {
		return this.result === undefined;
	}

	get rows() {
		return commonPx.map((px) => ({
			px,
			rem: format(px / this.base),
			current: px === this.pixels,
		}));
	}

	typed = (text: string) => (this.text = text);

	nudge = (direction: -1 | 1) =>
		(this.text = nudged(
			parse(this.text, this.inputUnit),
			direction,
			this.remToPixel,
		));

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	pickDirection = (index: number) => {
		const { result } = this;
		this.remToPixel = index === 1;
		if (result !== undefined) this.text = format(result);
	};

	pickBase = (base: number) => (this.base = base);

	use = (px: number) =>
		(this.text = format(this.remToPixel ? px / this.base : px));

	copy = () => {
		const { result } = this;
		if (result === undefined) return;
		void this.toast.copy(`${format(result)}${this.outputUnit}`);
	};

	<template>
		<CanonSplit class="px-to-rem">
			<:banner>
				<CanonCanvas @height={{200}}>
					<Specimen
						@pixels={{this.pixels}}
						@base={{this.base}}
						@result={{this.figure.text}}
						@unit={{this.figure.unit}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonBigNumberField
						@value={{this.text}}
						@placeholder="0"
						@unit={{upper this.inputUnit}}
						@label="Value"
						@onStep={{this.nudge}}
						@onInput={{this.typed}}
						{{on "focusin" this.selectAll}}
					/>
					<CanonSegmented
						aria-label="Direction"
						@items={{directions}}
						@selected={{if
							this.remToPixel
							1
							0
						}}
						@onChange={{this.pickDirection}}
					/>
					<CanonRow
						@title="Base"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.base}}
							@min={{baseRange.min}}
							@max={{baseRange.max}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.pickBase}}
						/>
					</CanonRow>
					<CanonButton
						@text="Copy"
						@icon={{CopyIcon}}
						@disabled={{this.copyDisabled}}
						@onClick={{this.copy}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Quick Reference" />
					<div
						class="px-to-rem-row px-to-rem-row--header"
						aria-hidden="true"
					>
						<span>Pixels</span>
						<span
							class="px-to-rem-row-rem"
						>REM</span>
					</div>
					{{#each this.rows key="px" as |row|}}
						<ReferenceRow
							@px={{row.px}}
							@rem={{row.rem}}
							@current={{row.current}}
							@onPick={{fn
								this.use
								row.px
							}}
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
