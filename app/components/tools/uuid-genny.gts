import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	clampCount,
	COUNT_MAX,
	COUNT_MIN,
	formatIdentifier,
	generateIdentifier,
	generateIdentifiers,
	IDENTIFIER_KINDS,
	type IdentifierKind,
} from 'delphitools-v2/lib/uuid';
import UuidPicture from 'delphitools-v2/components/tools/uuid-genny/picture';
import './uuid-genny/uuid-genny.css';

const Refresh = <template><IconSvg @name="refresh-cw" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;

const kindTitles = IDENTIFIER_KINDS.map((kind) => kind.label);
const defaultCount = 10;
const fadeRows = 24;
const fadeStep = 0.018;

function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const kind = IDENTIFIER_KINDS.find(
		(k) => k.id === query.get('uuidKind'),
	)?.id;
	const count = Number(query.get('uuidCount'));
	return {
		kind: kind ?? 'uuid4',
		count: query.has('uuidCount')
			? clampCount(count)
			: defaultCount,
		selected: Number(query.get('uuidSelect')) || 0,
		uppercase: query.get('uuidUpper') === '1',
		stripHyphens: query.get('uuidStrip') === '1',
	};
}

export default class UuidGenny extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked kind: IdentifierKind;
	@tracked count: number;
	@tracked uppercase: boolean;
	@tracked stripHyphens: boolean;
	@tracked ids: string[];
	@tracked selected: number;
	@tracked fades = false;
	@tracked scrambleKey = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.kind = flags.kind;
		this.count = flags.count;
		this.uppercase = flags.uppercase;
		this.stripHyphens = flags.stripHyphens;
		this.selected = flags.selected;
		this.ids = generateIdentifiers(this.kind, this.count);
	}

	get isUuid() {
		return this.kind !== 'nanoid';
	}

	get kindIndex() {
		return IDENTIFIER_KINDS.findIndex((k) => k.id === this.kind);
	}

	get kindLabel() {
		return IDENTIFIER_KINDS[this.kindIndex]!.label;
	}

	get rows() {
		const options = {
			uppercase: this.uppercase,
			stripHyphens: this.stripHyphens,
		};
		return this.ids.map((raw, index) => ({
			raw,
			text: formatIdentifier(raw, this.kind, options),
			number: String(index + 1).padStart(2, '0'),
			lit: index === this.shownIndex,
			fadeDelay:
				this.fades && index < fadeRows
					? index * fadeStep
					: undefined,
		}));
	}

	get shownIndex() {
		return Math.min(
			Math.max(this.selected, 0),
			this.ids.length - 1,
		);
	}

	get shown() {
		return this.rows[this.shownIndex]!;
	}

	get joined() {
		return this.rows.map((row) => row.text).join('\n');
	}

	pickKind = (index: number) => {
		const kind = IDENTIFIER_KINDS[index]?.id;
		if (!kind || kind === this.kind) return;
		this.kind = kind;
		this.regenerate();
	};

	setCount = (value: number) => {
		this.count = clampCount(value);
		this.fades = false;
		this.ids =
			this.ids.length >= this.count
				? this.ids.slice(0, this.count)
				: [
						...this.ids,
						...Array.from(
							{
								length:
									this
										.count -
									this.ids
										.length,
							},
							() =>
								generateIdentifier(
									this
										.kind,
								),
						),
					];
	};

	setUppercase = (on: boolean) => {
		this.uppercase = on;
		this.fades = false;
	};

	setStripHyphens = (on: boolean) => {
		this.stripHyphens = on;
		this.fades = false;
	};

	regenerate = () => {
		this.ids = generateIdentifiers(this.kind, this.count);
		this.fades = true;
		this.scrambleKey += 1;
	};

	select = (index: number) => {
		this.fades = false;
		if (index === this.shownIndex) return;
		this.selected = index;
		this.scrambleKey += 1;
	};

	copyAll = () => void this.toast.copy(this.joined);

	<template>
		<CanonSplit class="uuid-genny">
			<:banner>
				<CanonCanvas
					@fitting={{true}}
					@animated={{true}}
				>
					<UuidPicture
						@text={{this.shown.text}}
						@raw={{this.shown.raw}}
						@kind={{this.kind}}
						@label={{this.kindLabel}}
						@scrambleKey={{this.scrambleKey}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Kind" />
					<CanonSegmented
						@items={{kindTitles}}
						@selected={{this.kindIndex}}
						@onChange={{this.pickKind}}
					/>
					<CanonHeading @text="Options" />
					<CanonGrid @columns={{1}}>
						<CanonRow
							class="uuid-genny-option
								{{unless
									this.isUuid
									'uuid-genny-option--off'
								}}"
							@title="Uppercase"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.uppercase}}
								@disabled={{unless
									this.isUuid
									true
								}}
								@onChange={{this.setUppercase}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							class="uuid-genny-option
								{{unless
									this.isUuid
									'uuid-genny-option--off'
								}}"
							@title="Strip hyphens"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.stripHyphens}}
								@disabled={{unless
									this.isUuid
									true
								}}
								@onChange={{this.setStripHyphens}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					</CanonGrid>
					<CanonButton
						@kind="primary"
						@text="Regenerate"
						@icon={{Refresh}}
						@iconStyle="oversized"
						@onClick={{this.regenerate}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text={{this.kindLabel}}
					/>
					<CanonRow
						@title="Count"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.count}}
							@min={{COUNT_MIN}}
							@max={{COUNT_MAX}}
							@labelledBy={{titleId}}
							@onChange={{this.setCount}}
						/>
					</CanonRow>
					<CanonGrid>
						<CanonButton
							@kind="cell"
							@text="Copy all"
							@icon={{Copy}}
							@onClick={{this.copyAll}}
						/>
					</CanonGrid>
					{{#each
						this.rows key="@index"
						as |row index|
					}}
						<CanonValueLine
							class="uuid-genny-row"
							@layout="numbered"
							@label={{row.number}}
							@value={{row.text}}
							@lit={{row.lit}}
							@fadeDelay={{row.fadeDelay}}
							{{on
								"click"
								(fn
									this.select
									index
								)
							}}
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
