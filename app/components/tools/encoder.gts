import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { IconSvg } from 'delphitools-v2/components/icon';
import Digest from 'delphitools-v2/components/tools/encoder/digest';
import {
	algorithms,
	base64Outcome,
	decoding,
	digests,
	encoding,
	flippedBits,
	hex,
	urlDecodePairs,
	urlEncodePairs,
	urlOutcome,
} from 'delphitools-v2/components/tools/encoder/engine';
import Pairs from 'delphitools-v2/components/tools/encoder/pairs';
import Regroup from 'delphitools-v2/components/tools/encoder/regroup';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import Source from 'delphitools-v2/components/tools/text-tool/source';
import './encoder/encoder.css';

const schemes = ['Base64', 'URL', 'Hash'];
const directions = ['Encode', 'Decode'];
const algorithmNames = algorithms.map((a) => a.name);
const bandHeight = 172;

const SwapIcon = <template><IconSvg @name="arrow-up-down" /></template>;

export default class Encoder extends Component {
	@tracked text = '';
	@tracked scheme = 0;
	@tracked decoding = false;
	@tracked algorithm = 1;
	@tracked digests: Uint8Array[] = [];
	@tracked flips?: number[];
	#run = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const index = (
			key: string,
			count: number,
			fallback: number,
		) => {
			const n = Number(query.get(key) ?? NaN);
			return Number.isInteger(n) && n >= 0 && n < count
				? n
				: fallback;
		};
		this.scheme = index('encScheme', schemes.length, 0);
		this.decoding = query.get('encDecode') === '1';
		this.algorithm = index('encAlgo', algorithms.length, 1);
		this.setText(query.get('encText') ?? '');
	}

	willDestroy() {
		super.willDestroy();
		this.#run++;
	}

	get schemes() {
		return schemes;
	}

	get directions() {
		return directions;
	}

	get algorithmNames() {
		return algorithmNames;
	}

	get bandHeight() {
		return bandHeight;
	}

	get hashing() {
		return this.scheme === 2;
	}

	get outcome() {
		return this.scheme === 0
			? base64Outcome(this.text, this.decoding)
			: urlOutcome(this.text, this.decoding);
	}

	get output() {
		const { outcome } = this;
		return 'text' in outcome ? outcome.text : '';
	}

	get error() {
		const { outcome } = this;
		return 'error' in outcome ? outcome.error : undefined;
	}

	get heading() {
		if (this.decoding) return 'Text';
		return this.scheme === 0 ? 'Base64' : 'URL';
	}

	get pictureLabel() {
		return this.hashing
			? algorithmNames[this.algorithm]!
			: schemes[this.scheme]!;
	}

	get reading() {
		return this.decoding
			? decoding(this.text)
			: encoding([...new TextEncoder().encode(this.text)]);
	}

	get pairs() {
		return this.decoding
			? urlDecodePairs(this.text)
			: urlEncodePairs(this.text);
	}

	get chosen() {
		const { name, bits } = algorithms[this.algorithm]!;
		return {
			name,
			bits,
			bytes: this.digests[this.algorithm],
			flipped: this.flips?.[this.algorithm],
		};
	}

	get hashes() {
		return algorithms.map((a, i) => ({
			name: a.name,
			value: this.digests[i]
				? hex(this.digests[i])
				: undefined,
			lit: i === this.algorithm,
		}));
	}

	setText = (text: string) => {
		this.text = text;
		void this.#hash(text);
	};

	async #hash(text: string) {
		const run = ++this.#run;
		const next = await (text ? digests(text) : Promise.resolve([]));
		if (run !== this.#run) return;
		const before = this.digests;
		this.flips =
			before.length && next.length
				? next.map((d, i) => flippedBits(before[i]!, d))
				: undefined;
		this.digests = next;
	}

	pickScheme = (index: number) => (this.scheme = index);

	pickDirection = (index: number) => (this.decoding = index === 1);

	pickAlgorithm = (index: number) => {
		this.algorithm = index;
		this.flips = undefined;
	};

	swap = () => {
		const { output } = this;
		if (!output) return;
		this.decoding = !this.decoding;
		this.setText(output);
	};

	<template>
		<CanonSplit class="encoder" @collapsesTo={{104}}>
			<:banner>
				<CanonCanvas @height={{this.bandHeight}}>
					{{#if this.hashing}}
						<Digest
							@name={{this.chosen.name}}
							@bits={{this.chosen.bits}}
							@bytes={{this.chosen.bytes}}
							@flipped={{this.chosen.flipped}}
						/>
					{{else if this.scheme}}
						<Pairs
							@pairs={{this.pairs}}
							@label={{this.pictureLabel}}
						/>
					{{else}}
						<Regroup
							@reading={{this.reading}}
							@label={{this.pictureLabel}}
						/>
					{{/if}}
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Mode" />
					<CanonSegmented
						aria-label="Mode"
						@items={{this.schemes}}
						@selected={{this.scheme}}
						@onChange={{this.pickScheme}}
					/>
					{{#if this.hashing}}
						<CanonSegmented
							aria-label="Hash"
							@items={{this.algorithmNames}}
							@selected={{this.algorithm}}
							@onChange={{this.pickAlgorithm}}
						/>
					{{else}}
						<CanonSegmented
							aria-label="Direction"
							@items={{this.directions}}
							@selected={{if
								this.decoding
								1
								0
							}}
							@onChange={{this.pickDirection}}
						/>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<Source
						@heading="Input"
						@text={{this.text}}
						@onChange={{this.setText}}
					/>
				</CanonRows>
				{{#if this.hashing}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Hashes" />
						{{#each this.hashes as |line|}}
							<CanonValueLine
								class="enc-hash"
								@label={{line.name}}
								@value={{line.value}}
								@layout="above"
								@lit={{line.lit}}
							/>
						{{/each}}
					</CanonRows>
				{{else}}
					<Result
						class="enc-result"
						@heading={{this.heading}}
						@text={{this.output}}
						@fileName="encoded.txt"
						@busy={{if
							this.error
							true
							false
						}}
					>
						<:extra>
							{{#if this.error}}
								<CanonStatus
									@text={{this.error}}
									@tone="warn"
									@row={{true}}
								/>
							{{/if}}
							<CanonGrid>
								<CanonButton
									@text="Swap"
									@icon={{SwapIcon}}
									@disabled={{if
										this.output
										false
										true
									}}
									@onClick={{this.swap}}
								/>
							</CanonGrid>
						</:extra>
					</Result>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
