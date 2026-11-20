import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { glyphRows } from 'delphicanon/lib/glyph-rows';
import Keyboard from 'delphitools-v2/components/tools/braille-converter/keyboard';
import Embossing, {
	bandHeight,
	collapsedHeight,
} from 'delphitools-v2/components/tools/braille-converter/embossing';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import Source from 'delphitools-v2/components/tools/text-tool/source';
import {
	dots,
	fromBraille,
	looksLikeBraille,
	read,
	toBraille,
} from 'delphitools-v2/lib/braille';
import './braille-converter/braille-converter.css';

const modes = ['Auto', 'To braille', 'To text'];
const page = { cells: 40, lines: 25 };
const dash = '—';

const isSpace = (char: string) => char === ' ' || char === '⠀';

export default class BrailleConverter extends Component {
	@tracked input = '';
	@tracked mode = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const mode = Number(query.get('brailleMode'));
		if (mode >= 0 && mode < modes.length)
			this.mode = Math.floor(mode);
		this.input = query.get('brailleText') ?? '';
	}

	get modes() {
		return modes;
	}

	get toText() {
		return (
			this.mode === 2 ||
			(this.mode === 0 && looksLikeBraille(this.input))
		);
	}

	get converted() {
		return this.toText
			? fromBraille(this.input)
			: toBraille(this.input);
	}

	get braille() {
		return this.toText ? this.input : this.converted;
	}

	get readings() {
		return read(this.braille);
	}

	get spoken() {
		return this.toText ? this.converted : this.input;
	}

	get sourceHeading() {
		return this.toText ? 'Braille' : 'Text';
	}

	get resultHeading() {
		return this.toText ? 'Text' : 'Braille';
	}

	get pageHeading() {
		return `Page size · ${page.cells} × ${page.lines}`;
	}

	get resultCells() {
		return [...this.converted].map((char) => ({
			char,
			dots: dots(char),
		}));
	}

	get tiles() {
		const chars = [...this.braille];
		const cells = chars.filter((c) => c !== '\n').length;
		const { rows } = glyphRows(
			chars.map(() => 1),
			chars.map((c) =>
				c === '\n'
					? 'newline'
					: isSpace(c)
						? 'space'
						: 'glyph',
			),
			page.cells,
			0,
			1,
			1,
		);
		const shown = (n: number) =>
			cells > 0 ? n.toLocaleString() : dash;
		return [
			{ label: 'Cells', value: shown(cells) },
			{ label: 'Lines', value: shown(rows) },
			{
				label: 'Pages',
				value: shown(Math.ceil(rows / page.lines)),
			},
		];
	}

	setInput = (text: string) => {
		this.input = text;
	};

	get keyboard() {
		return this.toText || (this.mode === 0 && !this.input.trim());
	}

	insert = (text: string) => {
		this.input += text;
	};

	deleteLast = () => {
		this.input = [...this.input].slice(0, -1).join('');
	};

	setMode = (mode: number) => {
		this.mode = mode;
	};

	<template>
		<CanonSplit
			class="braille-converter"
			@halves={{true}}
			@collapsesTo={{collapsedHeight}}
		>
			<:banner>
				<CanonCanvas @height={{bandHeight}}>
					<Embossing
						@readings={{this.readings}}
						@label={{this.spoken}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<Source
						@heading={{this.sourceHeading}}
						@text={{this.input}}
						@onChange={{this.setInput}}
					>
						{{#if this.keyboard}}
							<Keyboard
								@onInsert={{this.insert}}
								@onDelete={{this.deleteLast}}
							/>
						{{/if}}
					</Source>
					<CanonHeading @text="Mode" />
					<CanonSegmented
						aria-label="Mode"
						@items={{this.modes}}
						@selected={{this.mode}}
						@onChange={{this.setMode}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<Result
					class={{unless
						this.toText
						"brl-result--braille"
					}}
					@heading={{this.resultHeading}}
					@text={{this.converted}}
					@fileName="braille.txt"
				>
					{{#if this.toText}}
						<span>{{this.converted}}</span>
					{{else}}
						{{~#each
							this.resultCells
							as |cell|
						~}}
							{{~#if cell.dots~}}
								<span
									class="brl-result-cell"
									title={{cell.dots}}
								>{{cell.char}}</span>
							{{~else~}}
								<span
								>{{cell.char}}</span>
							{{~/if~}}
						{{~/each~}}
					{{/if}}
				</Result>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text={{this.pageHeading}}
					/>
					<CanonTiles @items={{this.tiles}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
