import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import CandidateRow from 'delphitools-v2/components/tools/decoder/candidate';
import {
	AFFINE_COPRIMES,
	CIPHER_OPTIONS,
	SAMPLES,
	classifyAndDecode,
	runManual,
	type Candidate,
	type CipherId,
	type ManualParams,
} from 'delphitools-v2/components/tools/decoder/engine';
import Picture, {
	headHeight,
	stageHeight,
} from 'delphitools-v2/components/tools/decoder/picture';
import { caption } from 'delphitools-v2/components/tools/decoder/scene';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import './decoder/decoder.css';

export {
	classifyAndDecode,
	englishLikeness,
} from 'delphitools-v2/components/tools/decoder/engine';

const modes = ['Auto-decode', 'Manual'];
const directions = ['Decode', 'Encode'];
const cipherIds = CIPHER_OPTIONS.map((option) => option.value);
const cipherLabels = CIPHER_OPTIONS.map((option) => option.label);
const coprimes = AFFINE_COPRIMES.map(String);
const collapsedHeight = headHeight + 88 + 4;
const emptyHeight = headHeight + 88 + stageHeight + 4;

const reference = [
	{
		title: 'Classical (alphabet) ciphers',
		entries: [
			{
				name: 'Caesar',
				text: 'fixed shift along the alphabet (key: 1–25).',
			},
			{
				name: 'ROT13',
				text: 'Caesar with shift 13 (self-inverse).',
			},
			{
				name: 'ROT47',
				text: 'shift 47 across printable ASCII (33–126).',
			},
			{ name: 'Atbash', text: 'A↔Z, B↔Y, … (no key).' },
			{
				name: 'Vigenère',
				text: 'repeating-keyword polyalphabetic shift.',
			},
			{
				name: 'Affine',
				text: 'y = (a·x + b) mod 26; a coprime with 26.',
			},
			{
				name: 'Rail fence',
				text: 'zig-zag transposition over N rails.',
			},
		],
	},
	{
		title: 'Codes',
		entries: [
			{
				name: 'Morse code',
				text: 'dots and dashes; / separates words.',
			},
			{ name: 'A1Z26', text: 'A=1, B=2, …, Z=26.' },
			{
				name: "Bacon's cipher",
				text: 'five-bit A/B groups per letter.',
			},
		],
	},
	{
		title: 'Encodings',
		entries: [
			{
				name: 'Base64 / Base32 / Hex / Binary',
				text: 'byte-level encodings, not ciphers.',
			},
		],
	},
	{
		title: 'Not included',
		entries: [
			{
				name: '',
				text: 'Playfair, Hill, Enigma, custom monoalphabetic substitution, and columnar transposition are not in this tool. They each need substantial setup (5×5 grids, matrix maths, rotor wirings, custom key tables) and are best served by dedicated tools.',
			},
		],
	},
];

const OpenIcon = <template><IconSvg @name="chevron-down" /></template>;
const CloseIcon = <template><IconSvg @name="chevron-up" /></template>;

const clampInt = (value: string | null, min: number, max: number) => {
	const n = Number(value ?? NaN);
	return Number.isInteger(n)
		? Math.min(Math.max(n, min), max)
		: undefined;
};

export default class Decoder extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked input = '';
	@tracked manual = false;
	@tracked cipher: CipherId = 'caesar';
	@tracked encoding = false;
	@tracked caesarShift = 3;
	@tracked vigenereKey = '';
	@tracked affineA = 5;
	@tracked affineB = 8;
	@tracked rails = 3;
	@tracked referenceOpen = false;
	@tracked pictureHeight = emptyHeight;
	@tracked typing = false;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.manual = query.get('cipherManual') === '1';
		const id = query.get('cipherId') as CipherId | null;
		if (id && cipherIds.includes(id)) this.cipher = id;
		this.encoding = query.get('cipherEncode') === '1';
		this.caesarShift =
			clampInt(query.get('cipherShift'), 1, 25) ?? 3;
		this.rails = clampInt(query.get('cipherRails'), 2, 10) ?? 3;
		this.vigenereKey = query.get('cipherKey') ?? '';
		this.referenceOpen = query.get('cipherReference') === '1';
		const sample = clampInt(
			query.get('cipherSample'),
			0,
			SAMPLES.length - 1,
		);
		this.input =
			query.get('cipherText') ??
			(sample === undefined ? '' : SAMPLES[sample]!.text);
	}

	get modes() {
		return modes;
	}

	get directions() {
		return directions;
	}

	get cipherLabels() {
		return cipherLabels;
	}

	get coprimes() {
		return coprimes;
	}

	get samples() {
		return SAMPLES;
	}

	get reference() {
		return reference;
	}

	get collapsesTo() {
		return this.typing ? Number.MAX_SAFE_INTEGER : collapsedHeight;
	}

	get cipherIndex() {
		return cipherIds.indexOf(this.cipher);
	}

	get affineIndex() {
		return Math.max(0, AFFINE_COPRIMES.indexOf(this.affineA));
	}

	get params(): ManualParams {
		return {
			caesarShift: this.caesarShift,
			vigenereKey: this.vigenereKey,
			affineA: this.affineA,
			affineB: this.affineB,
			rails: this.rails,
		};
	}

	get trimmed() {
		return this.input.trim();
	}

	@cached
	get candidates() {
		return this.manual ? [] : classifyAndDecode(this.input);
	}

	get outcome(): { text: string } | { error: string } {
		try {
			return {
				text: runManual(
					this.input,
					this.cipher,
					this.encoding,
					this.params,
				),
			};
		} catch (error) {
			return {
				error:
					error instanceof Error
						? error.message
						: 'Error',
			};
		}
	}

	get output() {
		const { outcome } = this;
		return 'text' in outcome ? outcome.text : '';
	}

	get error() {
		const { outcome } = this;
		return 'error' in outcome ? outcome.error : undefined;
	}

	get scene() {
		if (this.manual) {
			return {
				cipher: this.cipher,
				encode: this.encoding,
				params: this.params,
				input: this.input,
				output: this.output,
				...caption(this.cipher, this.params),
				score: undefined,
			};
		}
		const hero = this.candidates[0];
		if (!hero || !this.trimmed)
			return {
				cipher: 'caesar' as CipherId,
				encode: false,
				params: { ...this.params, vigenereKey: '' },
				input: '',
				output: '',
				name: 'Auto-decode',
				detail: '',
				score: undefined,
			};
		return {
			cipher: hero.cipherId,
			encode: false,
			params: { ...this.params, ...hero.params },
			input: this.trimmed,
			output: hero.output,
			name: hero.cipher,
			detail: hero.detail,
			score: hero.score,
		};
	}

	setInput = (text: string) => (this.input = text);

	setTyping = (typing: boolean) => (this.typing = typing);

	measured = (height: number) => {
		if (height + 4 !== this.pictureHeight)
			this.pictureHeight = height + 4;
	};

	pickMode = (index: number) => (this.manual = index === 1);

	pickCipher = (index: number) => (this.cipher = cipherIds[index]!);

	pickDirection = (index: number) => (this.encoding = index === 1);

	setShift = (value: number) => (this.caesarShift = value);

	setKey = (value: string) => (this.vigenereKey = value);

	pickAffineA = (index: number) =>
		(this.affineA = AFFINE_COPRIMES[index]!);

	setAffineB = (value: number) => (this.affineB = value);

	setRails = (value: number) => (this.rails = value);

	toggleReference = () => (this.referenceOpen = !this.referenceOpen);

	is = (cipher: CipherId) => this.cipher === cipher;

	copy = (text: string) => void this.toast.copy(text);

	tweak = (candidate: Candidate) => {
		const { params } = candidate;
		this.cipher = candidate.cipherId;
		this.encoding = false;
		if (params?.caesarShift !== undefined)
			this.caesarShift = params.caesarShift;
		if (params?.vigenereKey !== undefined)
			this.vigenereKey = params.vigenereKey;
		if (params?.affineA !== undefined)
			this.affineA = params.affineA;
		if (params?.affineB !== undefined)
			this.affineB = params.affineB;
		if (params?.rails !== undefined) this.rails = params.rails;
		this.manual = true;
	};

	<template>
		<CanonSplit class="decoder" @collapsesTo={{this.collapsesTo}}>
			<:banner>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Picture
						@text={{this.input}}
						@onInput={{this.setInput}}
						@onHeight={{this.measured}}
						@onFocus={{this.setTyping}}
						@cipher={{this.scene.cipher}}
						@encode={{this.scene.encode}}
						@params={{this.scene.params}}
						@source={{this.scene.input}}
						@output={{this.scene.output}}
						@name={{this.scene.name}}
						@detail={{this.scene.detail}}
						@score={{this.scene.score}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Mode" />
					<CanonSegmented
						aria-label="Mode"
						@items={{this.modes}}
						@selected={{if this.manual 1 0}}
						@onChange={{this.pickMode}}
					/>
					{{#if this.manual}}
						<CanonRow
							@title="Cipher"
							@form="flush"
							as |titleId|
						>
							<CanonMenuCell
								@items={{this.cipherLabels}}
								@selected={{this.cipherIndex}}
								@labelledBy={{titleId}}
								@onChange={{this.pickCipher}}
							/>
						</CanonRow>
						<CanonSegmented
							aria-label="Direction"
							@items={{this.directions}}
							@selected={{if
								this.encoding
								1
								0
							}}
							@onChange={{this.pickDirection}}
						/>
						{{#if (this.is "caesar")}}
							<CanonRow
								@title="Shift"
								@form="flush"
								as |titleId|
							>
								<CanonNumberField
									@value={{this.caesarShift}}
									@min={{1}}
									@max={{25}}
									@labelledBy={{titleId}}
									@onChange={{this.setShift}}
								/>
							</CanonRow>
						{{else if (this.is "vigenere")}}
							<CanonRow
								@title="Key"
								@form="flush"
							>
								<CanonTextCell
									class="dec-key"
									aria-label="Key"
									autocapitalize="characters"
									autocomplete="off"
									spellcheck="false"
									@value={{this.vigenereKey}}
									@placeholder="LEMON"
									@onChange={{this.setKey}}
								/>
							</CanonRow>
						{{else if (this.is "affine")}}
							<CanonRow
								@title="a"
								@form="stacked"
							>
								<CanonSegmented
									aria-label="a"
									@items={{this.coprimes}}
									@columns={{6}}
									@selected={{this.affineIndex}}
									@onChange={{this.pickAffineA}}
								/>
							</CanonRow>
							<CanonRow
								@title="b"
								@form="flush"
								as |titleId|
							>
								<CanonNumberField
									@value={{this.affineB}}
									@min={{0}}
									@max={{25}}
									@labelledBy={{titleId}}
									@onChange={{this.setAffineB}}
								/>
							</CanonRow>
						{{else if
							(this.is "rail-fence")
						}}
							<CanonRow
								@title="Rails"
								@form="flush"
								as |titleId|
							>
								<CanonNumberField
									@value={{this.rails}}
									@min={{2}}
									@max={{10}}
									@labelledBy={{titleId}}
									@onChange={{this.setRails}}
								/>
							</CanonRow>
						{{/if}}
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				{{#if this.manual}}
					<Result
						class="dec-output"
						@heading="Output"
						@text={{this.output}}
						@fileName="decoded.txt"
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
						</:extra>
					</Result>
				{{else}}
					<CanonRows
						class="dec-candidates"
						@framed={{true}}
					>
						{{#if this.trimmed}}
							<CanonHeading
								@text="Candidates"
							/>
							{{#each
								this.candidates
								as |candidate index|
							}}
								<CandidateRow
									@candidate={{candidate}}
									@lit={{if
										index
										false
										true
									}}
									@onCopy={{fn
										this.copy
										candidate.output
									}}
									@onTweak={{if
										candidate.params
										(fn
											this.tweak
											candidate
										)
									}}
								/>
							{{else}}
								<CanonEmptyRow
									@text="No confident matches found. Try the Manual tab if you know the cipher."
								/>
							{{/each}}
							{{#if
								this.candidates.length
							}}
								<CanonStatus
									class="dec-note"
									@text="Candidates are ranked by English-likeness (letter frequency + common words). Vigenère key recovery uses the Index of Coincidence and works best on ciphertext longer than ~50 letters."
									@tone="muted"
									@row={{true}}
								/>
							{{/if}}
						{{else}}
							<CanonHeading
								@text="Examples"
							/>
							<CanonGrid
								@columns={{3}}
							>
								{{#each
									this.samples
									as |sample|
								}}
									<CanonButton
										@kind="cell"
										@text={{sample.label}}
										@onClick={{fn
											this.setInput
											sample.text
										}}
									/>
								{{/each}}
							</CanonGrid>
						{{/if}}
					</CanonRows>
				{{/if}}
				<CanonRows
					class="dec-reference"
					@framed={{true}}
				>
					<CanonButton
						class="dec-reference-toggle"
						@kind="cell"
						@text="Cipher reference"
						@icon={{if
							this.referenceOpen
							CloseIcon
							OpenIcon
						}}
						aria-expanded={{if
							this.referenceOpen
							"true"
							"false"
						}}
						@onClick={{this.toggleReference}}
					/>
					{{#if this.referenceOpen}}
						{{#each
							this.reference
							as |section|
						}}
							<CanonHeading
								@text={{section.title}}
							/>
							<ul
								class="dec-reference-list"
							>
								{{#each
									section.entries
									as |entry|
								}}
									<li
									>{{#if
											entry.name
										}}<strong
											>{{entry.name}}</strong>
											—
										{{/if}}{{entry.text}}</li>
								{{/each}}
							</ul>
						{{/each}}
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
