import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import type { TOC } from '@ember/component/template-only';
import CanonBigNumberField from 'delphicanon/components/canon-big-number-field';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import press from 'delphicanon/modifiers/canon-press';
import { parseDecimal } from 'delphicanon/lib/number';
import {
	activeMultiplier,
	commonSizes,
	customIndex,
	format,
	normalIndex,
	pangramRepeats,
	parseSize,
	presetFor,
	presets,
	ratioRange,
	resultLines,
	steppedSize,
} from 'delphitools-v2/components/tools/line-height-calc/line-height';
import Picture from 'delphitools-v2/components/tools/line-height-calc/picture';
import './line-height-calc/line-height-calc.css';

const typingDelayMs = 400;
const presetNames = presets.map((preset) => preset.name);
const pangram =
	'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.';

interface SizeRowSignature {
	Args: {
		size: number;
		lineHeight: string;
		leading: string;
		current: boolean;
		onPick: () => void;
	};
}

const SizeRow: TOC<SizeRowSignature> = <template>
	<button
		type="button"
		class="line-height-calc-row"
		aria-label="{{@size}}px, {{@lineHeight}}px, {{@leading}}px"
		aria-current={{if @current "true"}}
		{{press}}
		{{on "click" @onPick}}
	>
		<span>{{@size}}px</span>
		<span class="line-height-calc-row-height">{{@lineHeight}}</span>
		<span class="line-height-calc-row-leading">{{@leading}}</span>
	</button>
</template>;

export default class LineHeightCalc extends Component {
	@tracked size = 16;
	@tracked text = '16';
	@tracked selected: number = normalIndex;
	@tracked custom = 1.5;
	#timer?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const size = parseSize(query.get('lhSize') ?? '');
		if (size !== undefined) this.#show(size);
		const ratio = parseDecimal(query.get('lhRatio') ?? '');
		if (ratio !== undefined) this.pickRatio(ratio);
	}

	willDestroy() {
		super.willDestroy();
		window.clearTimeout(this.#timer);
	}

	get multiplier() {
		return activeMultiplier(this.selected, this.custom);
	}

	get lineHeight() {
		return this.size * this.multiplier;
	}

	get figure() {
		return format(this.lineHeight);
	}

	get lines() {
		return resultLines(this.size, this.multiplier);
	}

	get specimen() {
		return Array(pangramRepeats(this.size, pangram.length))
			.fill(pangram)
			.join(' ');
	}

	get rows() {
		const { multiplier } = this;
		return commonSizes.map((size) => ({
			size,
			lineHeight: format(size * multiplier),
			leading: format(size * multiplier - size),
			current: size === this.size,
		}));
	}

	#show(size: number) {
		window.clearTimeout(this.#timer);
		this.size = size;
		this.text = format(size);
	}

	commitTyped = () => {
		window.clearTimeout(this.#timer);
		const typed = parseSize(this.text);
		if (typed !== undefined) this.size = typed;
	};

	typed = (text: string) => {
		this.text = text;
		window.clearTimeout(this.#timer);
		this.#timer = window.setTimeout(
			this.commitTyped,
			typingDelayMs,
		);
	};

	endEditing = () => {
		this.commitTyped();
		this.text = format(this.size);
	};

	step = (direction: -1 | 1) =>
		this.#show(steppedSize(this.size, direction));

	use = (size: number) => this.#show(size);

	pickPreset = (index: number) => {
		if (index === customIndex) this.custom = this.multiplier;
		this.selected = index;
	};

	pickRatio = (multiplier: number) => {
		this.selected = presetFor(multiplier);
		this.custom = multiplier;
	};

	<template>
		<CanonSplit class="line-height-calc">
			<:banner>
				<CanonCanvas @height={{220}}>
					<Picture
						@size={{this.size}}
						@lineHeight={{this.lineHeight}}
						@figure={{this.figure}}
						@text={{this.specimen}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Font Size" />
					<CanonBigNumberField
						@value={{this.text}}
						@placeholder="16"
						@unit="PX"
						@label="Font Size"
						@onStep={{this.step}}
						@onInput={{this.typed}}
						@onEndEditing={{this.endEditing}}
					/>
					<CanonHeading @text="Line Height" />
					<CanonSegmented
						aria-label="Ratio"
						@items={{presetNames}}
						@selected={{this.selected}}
						@columns={{3}}
						@onChange={{this.pickPreset}}
					/>
					<CanonRow
						@title="Ratio"
						@form="flush"
						as |titleId|
					>
						<CanonDecimalField
							@value={{this.multiplier}}
							@min={{ratioRange.min}}
							@max={{ratioRange.max}}
							@unit="×"
							@step={{0.05}}
							@decimals={{3}}
							@labelledBy={{titleId}}
							@onChange={{this.pickRatio}}
						/>
					</CanonRow>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Result" />
					{{#each
						this.lines key="label"
						as |line|
					}}
						<CanonValueLine
							@label={{line.label}}
							@value={{line.value}}
							@labelWidth={{84}}
						/>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Common Sizes" />
					<div
						class="line-height-calc-row line-height-calc-row--header"
						aria-hidden="true"
					>
						<span>Font</span>
						<span
							class="line-height-calc-row-height"
						>Line Height</span>
						<span
							class="line-height-calc-row-leading"
						>Leading</span>
					</div>
					{{#each this.rows key="size" as |row|}}
						<SizeRow
							@size={{row.size}}
							@lineHeight={{row.lineHeight}}
							@leading={{row.leading}}
							@current={{row.current}}
							@onPick={{fn
								this.use
								row.size
							}}
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
