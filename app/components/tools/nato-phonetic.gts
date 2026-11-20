import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import Chart from 'delphitools-v2/components/tools/nato-phonetic/chart';
import Hoist, {
	bandHeight,
	collapsedHeight,
} from 'delphitools-v2/components/tools/nato-phonetic/hoist';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import Source from 'delphitools-v2/components/tools/text-tool/source';
import {
	ALPHABETS,
	looksSpelled,
	spell,
	spellText,
	unspell,
} from 'delphitools-v2/lib/spelling-alphabets';
import './nato-phonetic/nato-phonetic.css';

const directions = ['Auto', 'Spell', 'Read'];
const alphabetLabels = ALPHABETS.map((a) => a.label);

export default class NatoPhonetic extends Component {
	@tracked input = '';
	@tracked alphabetIndex = 0;
	@tracked direction = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const alphabet = Number(query.get('natoAlphabet'));
		if (alphabet >= 0 && alphabet < ALPHABETS.length)
			this.alphabetIndex = Math.floor(alphabet);
		const mode = Number(query.get('natoMode'));
		if (mode >= 0 && mode < directions.length)
			this.direction = Math.floor(mode);
		this.input = query.get('natoText') ?? '';
	}

	get alphabetLabels() {
		return alphabetLabels;
	}

	get directions() {
		return directions;
	}

	get alphabet() {
		return ALPHABETS[this.alphabetIndex] ?? ALPHABETS[0]!;
	}

	get reading() {
		return (
			this.direction === 2 ||
			(this.direction === 0 &&
				looksSpelled(this.input, this.alphabet))
		);
	}

	get converted() {
		return this.reading
			? unspell(this.input, this.alphabet)
			: spellText(this.input, this.alphabet);
	}

	get plain() {
		return this.reading ? this.converted : this.input;
	}

	get spelled() {
		return spell(this.plain, this.alphabet);
	}

	get used() {
		return this.reading ? '' : this.input.toUpperCase();
	}

	get sourceHeading() {
		return this.reading ? 'Spelled' : 'Text';
	}

	get resultHeading() {
		return this.reading ? 'Text' : 'Spelled';
	}

	setInput = (text: string) => {
		this.input = text;
	};

	setAlphabet = (index: number) => {
		this.alphabetIndex = index;
	};

	setDirection = (direction: number) => {
		this.direction = direction;
	};

	addLetter = (letter: string) => {
		if (this.reading) this.direction = 1;
		this.input += letter;
	};

	<template>
		<CanonSplit
			class="nato-phonetic"
			@halves={{true}}
			@collapsesTo={{collapsedHeight}}
		>
			<:banner>
				<CanonCanvas @height={{bandHeight}}>
					<Hoist
						@spelled={{this.spelled}}
						@label={{spellText
							this.plain
							this.alphabet
						}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<Source
						@heading={{this.sourceHeading}}
						@text={{this.input}}
						@onChange={{this.setInput}}
					/>
					<CanonHeading @text="Alphabet" />
					<CanonSegmented
						aria-label="Alphabet"
						@items={{this.alphabetLabels}}
						@columns={{2}}
						@selected={{this.alphabetIndex}}
						@onChange={{this.setAlphabet}}
					/>
					<CanonHeading @text="Direction" />
					<CanonSegmented
						aria-label="Direction"
						@items={{this.directions}}
						@selected={{this.direction}}
						@onChange={{this.setDirection}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<Result
					class="np-result"
					@heading={{this.resultHeading}}
					@text={{this.converted}}
					@fileName="spelled.txt"
				/>
				<CanonRows
					class="np-chart-rows"
					@framed={{true}}
				>
					<CanonHeading
						@text="Chart · Tap to spell"
					/>
					<Chart
						@alphabet={{this.alphabet}}
						@used={{this.used}}
						@onLetter={{this.addLetter}}
					/>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
