import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCommand, {
	type CanonCommandItem,
} from 'delphicanon/components/canon-command';
import CanonDialog, {
	type CanonDialogClose,
} from 'delphicanon/components/canon-dialog';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import type { CanonMenuItem } from 'delphicanon/components/canon-menu';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSheet from 'delphicanon/components/canon-sheet';
import CanonSplit from 'delphicanon/components/canon-split';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import Display, {
	type Readout,
} from 'delphitools-v2/components/tools/sci-calc/display';
import {
	calculate,
	formatNumber,
	join,
	keyIds,
	kind,
	openParens,
	pieces,
	printfG,
	text,
	toggledSign,
	typed,
	written,
	withExact,
	type Carried,
	type AngleMode,
	type Kind,
} from 'delphitools-v2/components/tools/sci-calc/entry';
import Keypad from 'delphitools-v2/components/tools/sci-calc/keypad';
import Tape, {
	type TapeEntry,
} from 'delphitools-v2/components/tools/sci-calc/tape';
import { MATH_CONSTANTS } from 'delphitools-v2/lib/math-constants';
import './sci-calc/sci-calc.css';

type MathModule = typeof import('mathjs');

let mathModule: Promise<MathModule> | null = null;
function loadMath(): Promise<MathModule> {
	mathModule ??= import('mathjs');
	return mathModule;
}

type Phase =
	| { kind: 'entry' }
	/** Just evaluated; holds the expression as it was typed. */
	| { kind: 'result'; typed: string }
	| { kind: 'failure'; text: string };

const historyLimit = 20;
const titleRoom = 110;
const displayHeight = 124;

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const HistoryIcon = <template><IconSvg @name="clock" /></template>;

const categories = [
	['mathematical', 'Mathematical'],
	['physical', 'Physical'],
	['chemical', 'Chemical'],
] as const;

const constantItems: CanonCommandItem[] = categories.flatMap(([id, group]) =>
	MATH_CONSTANTS.filter((c) => c.category === id).map((c) => ({
		id: `${id}-${c.name}`,
		title: c.name,
		group,
		keywords: [c.symbol],
		detail: [c.symbol, written(printfG(c.value, 10)), c.unit]
			.filter(Boolean)
			.join(' · '),
	})),
);
const constantValues = new Map(
	MATH_CONSTANTS.map((c) => [`${c.category}-${c.name}`, c.value]),
);

export default class SciCalcTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked expression = '';
	@tracked phase: Phase = { kind: 'entry' };
	@tracked angleMode: AngleMode = 'deg';
	@tracked history: TapeEntry[] = [];
	@tracked lastAnswer = 0;
	#carried: Carried[] = [];
	@tracked lastPreview?: string;
	@tracked math?: MathModule;
	@tracked stacked = false;
	@tracked titled = true;
	@tracked historyOpen = false;
	@tracked constantsOpen = false;
	#nextId = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		void loadMath().then((math) => {
			if (this.isDestroying) return;
			this.math = math;
			for (const token of (query.get('sciKeys') ?? '')
				.split(' ')
				.filter(Boolean))
				this.#typeToken(token);
			this.historyOpen = query.has('sciHistory');
			this.constantsOpen = query.has('sciConstants');
		});
	}

	#typeToken(token: string) {
		if (keyIds.has(token) || ['=', 'DEG', 'RAD'].includes(token)) {
			this.press(token);
			return;
		}
		for (const character of token) {
			const key = typed(character);
			if (key) this.press(key);
		}
	}

	get degrees() {
		return this.angleMode === 'deg';
	}

	get angleItems() {
		return [
			{ text: 'DEG', mode: 'deg' as const },
			{ text: 'RAD', mode: 'rad' as const },
		].map((item) => ({
			...item,
			selected: item.mode === this.angleMode,
		}));
	}

	get shown() {
		const { phase } = this;
		return phase.kind === 'result' ? phase.typed : this.expression;
	}

	get pieces() {
		return pieces(this.shown);
	}

	get ghosts() {
		return this.phase.kind === 'entry'
			? openParens(this.expression)
			: 0;
	}

	get dimmed() {
		return this.phase.kind === 'result';
	}

	get readout(): Readout {
		const { phase } = this;
		if (phase.kind === 'result')
			return { kind: 'result', text: this.expression };
		if (phase.kind === 'failure')
			return { kind: 'failure', text: phase.text };
		if (!this.expression) return { kind: 'idle', text: '0' };
		return this.lastPreview === undefined
			? { kind: 'blank', text: ' ' }
			: { kind: 'preview', text: this.lastPreview };
	}

	get copyText() {
		const { kind: shown, text: value } = this.readout;
		return shown === 'preview' || shown === 'result'
			? value
			: undefined;
	}

	exact(text: string) {
		return withExact(text, this.#carried);
	}

	preview(raw: string) {
		if (!this.math) return undefined;
		const value = calculate(
			this.math,
			this.exact(raw) + ')'.repeat(openParens(raw)),
			this.angleMode,
		);
		return typeof value === 'number' && Number.isFinite(value)
			? formatNumber(value)
			: undefined;
	}

	#settle() {
		const raw = this.expression;
		if (this.phase.kind !== 'entry') this.lastPreview = undefined;
		else if (!raw) this.lastPreview = undefined;
		else this.lastPreview = this.preview(raw) ?? this.lastPreview;
	}

	insert(value: string, of: Kind) {
		const base =
			this.phase.kind === 'result' && of !== 'other'
				? ''
				: this.expression;
		if (!base) this.#carried = [];
		this.expression = join(base, value, of);
		this.phase = { kind: 'entry' };
	}

	evaluate() {
		const { math } = this;
		if (this.phase.kind !== 'entry' || !this.expression) return;
		if (!math) {
			void loadMath().then(() => this.press('='));
			return;
		}
		this.expression += ')'.repeat(openParens(this.expression));
		const typedText = this.expression;
		const value = calculate(
			math,
			this.exact(typedText),
			this.angleMode,
		);
		if (typeof value === 'number' && !Number.isFinite(value)) {
			const textOf = Number.isNaN(value)
				? 'Error'
				: value > 0
					? '∞'
					: '-∞';
			this.phase = { kind: 'failure', text: textOf };
			return;
		}
		if (value === undefined) {
			this.phase = { kind: 'failure', text: 'Error' };
			return;
		}
		const result =
			typeof value === 'number' ? formatNumber(value) : value;
		this.lastAnswer = typeof value === 'number' ? value : 0;
		this.history = [
			{
				id: this.#nextId++,
				expression: typedText,
				result,
				pieces: pieces(typedText),
				written: written(result),
			},
			...this.history.slice(0, historyLimit - 1),
		];
		this.expression = result;
		this.#carried =
			typeof value === 'number'
				? [{ at: 0, text: result, value }]
				: [];
		this.phase = { kind: 'result', typed: typedText };
	}

	press = (key: string) => {
		switch (key) {
			case 'Const':
				this.constantsOpen = true;
				return;
			case 'DEG':
			case 'RAD':
				this.angleMode = key === 'DEG' ? 'deg' : 'rad';
				break;
			case '=':
				this.evaluate();
				break;
			case 'C':
				this.expression = '';
				this.#carried = [];
				this.phase = { kind: 'entry' };
				break;
			case '⌫':
				this.expression = [...this.expression]
					.slice(0, -1)
					.join('');
				this.phase = { kind: 'entry' };
				break;
			case '±': {
				const toggled = toggledSign(this.expression);
				if (toggled !== undefined)
					this.expression = toggled;
				else if (
					this.expression &&
					this.expression !== '0'
				)
					this.expression =
						this.expression.startsWith('-')
							? this.expression.slice(
									1,
								)
							: `-${this.expression}`;
				this.phase = { kind: 'entry' };
				break;
			}
			case 'Ans': {
				const shown = formatNumber(this.lastAnswer);
				this.insert(shown, 'factor');
				this.#carried = [
					...this.#carried,
					{
						at:
							this.expression.length -
							shown.length,
						text: shown,
						value: this.lastAnswer,
					},
				];
				break;
			}
			default:
				this.insert(text(key), kind(key));
		}
		this.#settle();
	};

	setAngle = (mode: AngleMode) => {
		this.angleMode = mode;
		this.#settle();
	};

	keyboard = modifier((element: HTMLElement) => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			if (event.metaKey || event.ctrlKey || event.altKey)
				return;
			const target = event.target as Element | null;
			if (
				target?.closest(
					'input, textarea, select, [contenteditable], dialog, [popover]',
				)
			)
				return;
			if (
				event.key === 'Enter' &&
				target?.closest('button, a, [role="button"]')
			)
				return;
			const key = typed(event.key);
			if (!key) return;
			event.preventDefault();
			this.press(key);
		};
		const onPaste = (event: ClipboardEvent) => {
			const target = event.target as Element | null;
			if (target?.closest('input, textarea, dialog')) return;
			const pasted = event.clipboardData
				?.getData('text/plain')
				.replace(/\s+/g, '');
			if (!pasted) return;
			event.preventDefault();
			this.insert(pasted, 'other');
			this.#settle();
		};
		const doc = element.ownerDocument;
		doc.addEventListener('keydown', onKeyDown);
		doc.addEventListener('paste', onPaste);
		return () => {
			doc.removeEventListener('keydown', onKeyDown);
			doc.removeEventListener('paste', onPaste);
		};
	});

	layout = modifier((row: HTMLElement) => {
		const body = row.closest('.canon-split-body');
		const run = () => {
			if (!body) return;
			const stacked =
				getComputedStyle(body)
					.getPropertyValue(
						'--canon-split-layout',
					)
					.trim() !== 'wide';
			this.stacked = stacked;
			if (!stacked) this.historyOpen = false;
			this.titled =
				row.clientWidth / (stacked ? 4 : 3) >=
				titleRoom;
		};
		const size = new ResizeObserver(run);
		size.observe(row);
		return () => size.disconnect();
	});

	copy = () => {
		const value = this.copyText;
		if (value) void this.toast.copy(value);
	};

	openHistory = () => (this.historyOpen = true);
	closeHistory = () => (this.historyOpen = false);
	closeConstants = () => (this.constantsOpen = false);

	load = (entry: TapeEntry) => {
		this.expression = entry.expression;
		this.phase = { kind: 'entry' };
		this.historyOpen = false;
		this.#settle();
	};

	tapeMenu = (entry: TapeEntry, item: CanonMenuItem) => {
		if (item.title === 'Copy') {
			void this.toast.copy(entry.result);
			return;
		}
		this.insert(entry.result, 'factor');
		this.historyOpen = false;
		this.#settle();
	};

	clearHistory = () => (this.history = []);

	chooseConstant = (close: CanonDialogClose, item: CanonCommandItem) => {
		const value = constantValues.get(item.id);
		if (value !== undefined) {
			this.insert(formatNumber(value), 'factor');
			this.#settle();
		}
		close();
	};

	<template>
		<CanonSplit
			class="sci-calc"
			@mainLeadsStacked={{true}}
			{{this.keyboard}}
		>
			<:sidebar>
				{{#unless this.stacked}}
					<CanonRows
						@framed={{true}}
						class="sci-tape"
					>
						<CanonHeading @text="History" />
						<Tape
							@entries={{this.history}}
							@onLoad={{this.load}}
							@onMenu={{this.tapeMenu}}
							@onClear={{this.clearHistory}}
						/>
					</CanonRows>
				{{/unless}}
			</:sidebar>
			<:main>
				<CanonCanvas
					@height={{displayHeight}}
					@pattern={{true}}
				>
					<Display
						@pieces={{this.pieces}}
						@ghosts={{this.ghosts}}
						@dimmed={{this.dimmed}}
						@readout={{this.readout}}
						@degrees={{this.degrees}}
					/>
				</CanonCanvas>
				<CanonRows @framed={{true}} class="sci-keys">
					<CanonGrid
						class="sci-modes"
						{{this.layout}}
					>
						{{#each
							this.angleItems
							as |item|
						}}
							<CanonButton
								@kind="segment"
								@text={{item.text}}
								@selected={{item.selected}}
								@onClick={{fn
									this.setAngle
									item.mode
								}}
							/>
						{{/each}}
						{{#if this.stacked}}
							<CanonButton
								@kind="cell"
								@text={{if
									this.titled
									"History"
									""
								}}
								@label="History"
								@icon={{HistoryIcon}}
								@onClick={{this.openHistory}}
							/>
						{{/if}}
						<CanonButton
							@kind="cell"
							@text={{if
								this.titled
								"Copy"
								""
							}}
							@label="Copy"
							@icon={{CopyIcon}}
							@disabled={{if
								this.copyText
								false
								true
							}}
							@onClick={{this.copy}}
						/>
					</CanonGrid>
					<Keypad @onPress={{this.press}} />
				</CanonRows>
				<div class="sci-nameplate" aria-hidden="true">
					<span class="sci-maker">DELPHI
						ELECTRONICS</span>
					<span class="sci-model">SC-1</span>
				</div>
				<CanonSheet
					@open={{this.historyOpen}}
					@title="History"
					@onClose={{this.closeHistory}}
				>
					<Tape
						@entries={{this.history}}
						@onLoad={{this.load}}
						@onMenu={{this.tapeMenu}}
						@onClear={{this.clearHistory}}
					/>
				</CanonSheet>
				<CanonDialog
					@open={{this.constantsOpen}}
					@onClose={{this.closeConstants}}
					aria-label="Constants"
				>
					<:default as |close|>
						<CanonCommand
							@items={{constantItems}}
							@placeholder="Search constants..."
							@label="Constants"
							@empty="No constant found."
							@onSelect={{fn
								this.chooseConstant
								close
							}}
						/>
					</:default>
				</CanonDialog>
			</:main>
		</CanonSplit>
	</template>
}
