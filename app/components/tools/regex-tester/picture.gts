import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonFigure from 'delphicanon/components/canon-figure';
import { IconSvg } from 'delphitools-v2/components/icon';
import MarkedEditor, {
	reportHeight,
} from 'delphitools-v2/components/tools/media/marked-editor';
import {
	failed,
	pieces,
	railLevels,
	type Piece,
	type RegexOutcome,
} from 'delphitools-v2/components/tools/regex-tester/regex';

interface PictureSignature {
	Args: {
		text: string;
		shownText: string;
		outcome: RegexOutcome;
		onInput: (text: string) => void;
		onHeight: (height: number) => void;
	};
}

const railGap = 3;
const railPitch = 5;
const railRoom = railGap + railLevels * railPitch;

const colour = (level: number) =>
	level === 0 ? 'var(--canon-primary)' : `var(--rx-group-${level})`;

function pieceStyle(piece: Piece) {
	const layers: string[] = [];
	for (const { level, starts, ends } of piece.rails) {
		const c = colour(level);
		const top = railGap + (level - 1) * railPitch;
		const fill = `linear-gradient(${c}, ${c})`;
		layers.push(
			`${fill} 0 calc(100% - ${railRoom - top - 2}px) / 100% 2px no-repeat padding-box`,
		);
		if (starts)
			layers.push(
				`${fill} 0 calc(100% - ${railRoom - top}px) / 1.5px 4px no-repeat padding-box`,
			);
		if (ends)
			layers.push(
				`${fill} 100% calc(100% - ${railRoom - top}px) / 1.5px 4px no-repeat padding-box`,
			);
	}
	if (piece.shade)
		layers.push(
			`linear-gradient(var(--rx-hit-${piece.shade}), var(--rx-hit-${piece.shade})) content-box`,
		);
	if (!layers.length) return undefined;
	const room = piece.rails.length
		? `padding-block-end: ${railRoom}px; `
		: '';
	return htmlSafe(`${room}background: ${layers.join(', ')}`);
}

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

const revealFirst = modifier((scroller: HTMLElement, [key]: [unknown]) => {
	void key;
	if (scroller.contains(document.activeElement)) return;
	const hit = scroller.querySelector<HTMLElement>('.rx-hit, .rx-caret');
	if (!hit) return;
	const top = hit.offsetTop - scroller.offsetTop;
	const visible =
		top >= scroller.scrollTop &&
		top <
			scroller.scrollTop +
				scroller.clientHeight -
				hit.offsetHeight;
	if (!visible) scroller.scrollTop = Math.max(0, top - 12);
});

export default class Picture extends Component<PictureSignature> {
	get matched() {
		const { outcome } = this.args;
		return outcome.kind === 'matched' ? outcome : undefined;
	}

	get failed() {
		return failed(this.args.outcome);
	}

	get count() {
		return this.matched?.matches.length ?? 0;
	}

	get groups() {
		return this.matched?.groups ?? 0;
	}

	get countText() {
		return String(this.count);
	}

	get groupsText() {
		return String(this.groups);
	}

	get word() {
		if (this.failed) return 'Invalid';
		return this.matched?.truncated ? 'Matches+' : 'Matches';
	}

	get figureColour() {
		if (this.failed) return 'var(--canon-destructive)';
		return this.count > 0
			? 'var(--canon-primary)'
			: 'var(--canon-muted-foreground)';
	}

	get pieces() {
		const { text, shownText } = this.args;
		const matches =
			text === shownText ? this.matched?.matches : undefined;
		return pieces(text, matches ?? []);
	}

	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text) this.args.onInput(text);
	};

	clear = () => this.args.onInput('');

	get textStyle() {
		const levels = Math.min(this.groups, railLevels);
		const gap = 6 + (levels > 0 ? levels * railPitch + 2 : 0);
		return htmlSafe(`--rx-line-gap: ${gap}px`);
	}

	<template>
		<div class="rx-picture">
			<div class="rx-picture-head">
				<span class="rx-picture-figure">
					<CanonFigure
						@text={{this.countText}}
						@size={{26}}
						@colour={{this.figureColour}}
					/>
					<span
						class="rx-picture-word
							{{if
								this.failed
								'rx-picture-word--failed'
							}}"
					>{{this.word}}</span>
				</span>
				{{#if this.groups}}
					<span class="rx-picture-figure">
						<CanonFigure
							@text={{this.groupsText}}
							@size={{26}}
							@colour="var(--canon-foreground)"
						/>
						<span
							class="rx-picture-word"
						>Groups</span>
					</span>
				{{/if}}
				<span class="rx-picture-tools">
					<CanonButton
						@kind="cell"
						@label="Paste"
						@icon={{PasteIcon}}
						@onClick={{this.paste}}
					/>
					<CanonButton
						@kind="cell"
						@label="Clear"
						@icon={{ClearIcon}}
						@disabled={{if
							@text
							false
							true
						}}
						@onClick={{this.clear}}
					/>
				</span>
			</div>
			<div
				class="rx-picture-scroll"
				{{revealFirst this.pieces}}
			>
				<MarkedEditor
					class="rx-picture-text"
					style={{this.textStyle}}
					@text={{@text}}
					@placeholder="Test String"
					@label="Test String"
					@onInput={{@onInput}}
					{{reportHeight @onHeight}}
				>
					{{~#each this.pieces as |piece|~}}
						{{~#if (isCaret piece)~}}
							<span
								class="rx-caret"
								style={{caretStyle
									piece
								}}
							></span>
						{{~else~}}
							<span
								class={{if
									piece.shade
									"rx-hit"
								}}
								style={{pieceStyle
									piece
								}}
							>{{piece.text}}</span>
						{{~/if~}}
					{{~/each~}}
				</MarkedEditor>
			</div>
		</div>
	</template>
}

function isCaret(piece: Piece) {
	return piece.caret !== undefined;
}

function caretStyle(piece: Piece) {
	return htmlSafe(`--rx-caret: ${colour(piece.caret ?? 0)}`);
}
