import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import type CanonToastService from 'delphicanon/services/canon-toast';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import TimecodeField from 'delphitools-v2/components/tools/timecode-calc/field';
import Picture from 'delphitools-v2/components/tools/timecode-calc/picture';
import {
	blank,
	clock,
	digitsOf,
	format,
	parse,
	parts,
	rates,
	register,
	seconds,
	type ParseResult,
	type Rate,
} from 'delphitools-v2/components/tools/timecode-calc/smpte';
import './timecode-calc/timecode-calc.css';

const rateLabels = rates.map((rate) => rate.label);
const operations = ['+', '−'];
const dash = '—';
const defaultRate = 4;

const CopyIcon = <template><IconSvg @name="copy" /></template>;

function note(parsed: ParseResult, rate: Rate) {
	if (parsed.ok)
		return parsed.snappedFrom
			? {
					tone: 'muted' as const,
					text: `Dropped frame · ${parsed.snappedFrom} → ${format(parsed.parts, rate)}`,
				}
			: undefined;
	const { error } = parsed;
	const text = {
		empty: undefined,
		'not-numeric': 'Numbers only',
		'too-many': 'Too many fields',
		'frame-range': `Frame too high · 00–${String(error.kind === 'frame-range' ? error.max : 0).padStart(2, '0')}`,
		'seconds-range': 'Seconds too high',
		'minutes-range': 'Minutes too high',
	}[error.kind];
	return text ? { tone: 'warn' as const, text } : undefined;
}

export default class TimecodeCalc extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked rateIndex = defaultRate;
	@tracked subtracts = false;
	@tracked a = '';
	@tracked b = '';
	startA = '';
	startB = '';

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const picked = rates.findIndex(
			(rate) => rate.id === query.get('tcRate'),
		);
		if (picked >= 0) this.rateIndex = picked;
		const { drop } = this.rate;
		this.startA = this.a = register(
			digitsOf(query.get('tcA') ?? ''),
			drop,
		);
		this.startB = this.b = register(
			digitsOf(query.get('tcB') ?? ''),
			drop,
		);
		this.subtracts = query.has('tcSubtract');
	}

	get rate() {
		return rates[this.rateIndex]!;
	}

	get parsedA() {
		return parse(this.a, this.rate);
	}

	get parsedB() {
		return parse(this.b, this.rate);
	}

	get frames(): number | undefined {
		const { parsedA: a, parsedB: b } = this;
		if (!a.ok) return undefined;
		if (!b.ok) return a.frames;
		return this.subtracts
			? a.frames - b.frames
			: a.frames + b.frames;
	}

	get result() {
		const { frames } = this;
		return frames === undefined
			? undefined
			: format(parts(frames, this.rate), this.rate);
	}

	line(parsed: ParseResult) {
		return parsed.ok
			? format(parsed.parts, this.rate)
			: blank(this.rate);
	}

	get lineA() {
		return this.line(this.parsedA);
	}

	get lineB() {
		return this.line(this.parsedB);
	}

	get lineResult() {
		return this.result ?? blank(this.rate);
	}

	get noteA() {
		return note(this.parsedA, this.rate);
	}

	get noteB() {
		return note(this.parsedB, this.rate);
	}

	get copyDisabled() {
		return this.result === undefined;
	}

	get tiles() {
		const { frames } = this;
		return [
			{
				label: 'Frames',
				value:
					frames === undefined
						? dash
						: frames.toLocaleString('en'),
			},
			{
				label: 'Real time',
				value:
					frames === undefined
						? dash
						: clock(
								seconds(
									frames,
									this
										.rate,
								),
							),
			},
		];
	}

	typeA = (text: string) => (this.a = text);
	typeB = (text: string) => (this.b = text);

	pickRate = (index: number) => (this.rateIndex = index);

	pickOperation = (index: number) => (this.subtracts = index === 1);

	copyResult = () => {
		if (this.result) void this.toast.copy(this.result);
	};

	<template>
		<CanonSplit class="timecode-calc">
			<:banner>
				<CanonCanvas @fitting={{true}}>
					<Picture
						@a={{this.lineA}}
						@b={{this.lineB}}
						@subtracts={{this.subtracts}}
						@result={{this.lineResult}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Timecode A" />
					<TimecodeField
						@value={{this.startA}}
						@dropFrame={{this.rate.drop}}
						@label="Timecode A"
						@onChange={{this.typeA}}
					/>
					{{#if this.noteA}}
						<CanonStatus
							class="tcc-note"
							@text={{this.noteA.text}}
							@tone={{this.noteA.tone}}
							@row={{true}}
						/>
					{{/if}}
					<CanonHeading @text="Operation" />
					<CanonSegmented
						aria-label="Operation"
						@items={{operations}}
						@selected={{if
							this.subtracts
							1
							0
						}}
						@onChange={{this.pickOperation}}
					/>
					<CanonHeading @text="Timecode B" />
					<TimecodeField
						@value={{this.startB}}
						@dropFrame={{this.rate.drop}}
						@label="Timecode B"
						@onChange={{this.typeB}}
					/>
					{{#if this.noteB}}
						<CanonStatus
							class="tcc-note"
							@text={{this.noteB.text}}
							@tone={{this.noteB.tone}}
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Frame rate" />
					<CanonRow
						@title="Frame rate"
						@form="flush"
						as |titleId|
					>
						<CanonMenuCell
							@items={{rateLabels}}
							@selected={{this.rateIndex}}
							@labelledBy={{titleId}}
							@onChange={{this.pickRate}}
						/>
					</CanonRow>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Result" />
					<CanonTiles @items={{this.tiles}} />
					<CanonButton
						@text="Copy"
						@icon={{CopyIcon}}
						@iconStyle="oversized"
						@kind="primary"
						@disabled={{this.copyDisabled}}
						@onClick={{this.copyResult}}
					/>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
