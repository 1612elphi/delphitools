import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import {
	charClass,
	frames,
	lineHeight,
	marqueeGap,
	marqueePace,
	padding,
	spaceGlyph,
	type Frame,
	type Size,
} from 'delphitools-v2/components/tools/large-type/layout';

export interface DisplaySignature {
	Args: {
		text: string;
		glyphs: string[];
		size: number;
		widest: number;
		advance: number;
		positions: boolean;
		colours: boolean;
		themeStyle: string;
		marquee: boolean;
		speed: number;
		onInput: (text: string) => void;
		onBox: (box: Size) => void;
	};
	Element: HTMLDivElement;
}

interface Caret {
	start: number;
	end: number;
}

function offsetOf(glyphs: string[], index: number) {
	return glyphs.slice(0, index).join('').length;
}

export default class Display extends Component<DisplaySignature> {
	@tracked box: Size = { width: 0, height: 0 };
	@tracked caret?: Caret;
	@tracked scrolled = 0;
	editor?: HTMLTextAreaElement;

	get inner() {
		return {
			width: this.box.width - padding * 2,
			height: this.box.height - padding * 2,
		};
	}

	get frames(): Frame[] {
		if (this.args.marquee) return [];
		return frames(
			this.args.glyphs,
			this.args.size,
			this.args.widest,
			this.inner.width,
			this.args.positions,
		);
	}

	get top() {
		const used = Math.max(
			0,
			...this.frames.map((f) => f.y + f.height),
		);
		return padding + Math.max(0, (this.inner.height - used) / 2);
	}

	get stageStyle() {
		const used = Math.max(
			0,
			...this.frames.map((f) => f.y + f.height),
		);
		const font = Math.round(this.args.size * 100) / 100;
		return htmlSafe(
			`${this.args.themeStyle}; --lt-size: ${font}px; min-block-size: max(100%, ${this.top + used + padding}px)`,
		);
	}

	get cells() {
		const { glyphs, colours } = this.args;
		const caret = this.caret;
		const top = this.top;
		return this.frames.map((frame, index) => {
			const ch = glyphs[index]!;
			const kind = charClass(ch);
			return {
				index,
				glyph: kind === 'space' ? spaceGlyph : ch,
				kind:
					kind === 'space' || colours
						? kind
						: 'letter',
				position: index + 1,
				shaded: index % 2 === 0,
				selected:
					caret !== undefined &&
					index >= caret.start &&
					index < caret.end,
				style: htmlSafe(
					`translate: ${(frame.x + padding).toFixed(2)}px ${(frame.y + top).toFixed(2)}px; inline-size: ${frame.width}px; block-size: ${frame.height}px`,
				),
			};
		});
	}

	get caretStyle() {
		const { caret, frames } = this;
		if (!caret || caret.start !== caret.end || !frames.length)
			return undefined;
		const at = frames[caret.start];
		const last = frames[frames.length - 1]!;
		const x = at ? at.x : last.x + last.width;
		const frame = at ?? last;
		return htmlSafe(
			`translate: ${(x + padding - 1).toFixed(2)}px ${(frame.y + this.top).toFixed(2)}px; block-size: ${frame.height}px`,
		);
	}

	get advancePx() {
		return this.args.size * this.args.advance;
	}

	get period() {
		return (this.args.glyphs.length + marqueeGap) * this.advancePx;
	}

	get marqueeGlyphs() {
		const { glyphs, colours } = this.args;
		if (!this.args.marquee || !glyphs.length || !(this.period > 0))
			return [];
		const copies =
			Math.ceil(
				(this.box.width + this.period) / this.period,
			) + 1;
		const run = [...glyphs, ...Array<string>(marqueeGap).fill(' ')];
		return Array.from({ length: copies }, () => run)
			.flat()
			.map((ch, index) => {
				const kind = charClass(ch);
				return {
					index,
					glyph: kind === 'space' ? '' : ch,
					kind:
						kind === 'space' || colours
							? kind
							: 'letter',
				};
			});
	}

	get marqueeStyle() {
		const height = this.args.size * lineHeight;
		return htmlSafe(
			`translate: ${(this.box.width - this.scrolled).toFixed(2)}px ${((this.box.height - height) / 2).toFixed(2)}px; --lt-advance: ${this.advancePx}px`,
		);
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const box = {
				width: entry?.contentRect.width ?? 0,
				height: entry?.contentRect.height ?? 0,
			};
			this.box = box;
			this.args.onBox(box);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	#ran?: { text: string; advance: number; width: number };

	run = modifier((_: HTMLElement, [text, period]: [string, number]) => {
		const advance = this.advancePx;
		const ran = this.#ran;
		this.#ran = { text, advance, width: this.box.width };
		let frame = 0;
		let last = performance.now();
		const step = (now: number) => {
			const elapsed =
				Math.min(Math.max(0, now - last), 100) / 1000;
			last = now;
			let next =
				this.scrolled +
				marqueePace *
					this.args.speed *
					advance *
					elapsed;
			if (period > 0 && next - period >= this.box.width)
				next -= period;
			this.scrolled = next;
			frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame((now) => {
			this.scrolled =
				ran?.text === text && ran.width > 0 && ran.advance > 0
					? (this.scrolled / ran.advance) *
						advance
					: this.box.width - padding;
			last = now;
			frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	});

	track = modifier((editor: HTMLTextAreaElement) => {
		this.editor = editor;
		const read = () => {
			if (document.activeElement !== editor) return;
			const { value, selectionStart, selectionEnd } = editor;
			this.caret = {
				start: Array.from(
					value.slice(0, selectionStart),
				).length,
				end: Array.from(value.slice(0, selectionEnd))
					.length,
			};
		};
		const leave = () => (this.caret = undefined);
		document.addEventListener('selectionchange', read);
		editor.addEventListener('focus', read);
		editor.addEventListener('blur', leave);
		return () => {
			document.removeEventListener('selectionchange', read);
			editor.removeEventListener('focus', read);
			editor.removeEventListener('blur', leave);
		};
	});

	input = (event: Event) =>
		this.args.onInput((event.target as HTMLTextAreaElement).value);

	place = (event: MouseEvent) => {
		const editor = this.editor;
		const { frames } = this;
		if (!editor || !frames.length || event.shiftKey) return;
		const x = event.offsetX - padding;
		const y = event.offsetY - this.top;
		const row = frames.filter(
			(f) => y >= f.y && y < f.y + f.height,
		);
		let index = this.args.glyphs.length;
		if (row.length) {
			const hit =
				row.find((f) => x < f.x + f.width) ??
				row.at(-1)!;
			index =
				frames.indexOf(hit) +
				(x > hit.x + hit.width / 2 ? 1 : 0);
		} else if (y < 0) index = 0;
		const offset = offsetOf(this.args.glyphs, index);
		editor.setSelectionRange(offset, offset);
	};

	<template>
		<div class="lt-display" {{this.measure}} ...attributes>
			<div class="lt-stage" style={{this.stageStyle}}>
				{{#if @marquee}}
					<div
						class="lt-marquee"
						aria-hidden="true"
						style={{this.marqueeStyle}}
						{{this.run @text this.period}}
					>
						{{#each
							this.marqueeGlyphs
							key="index"
							as |g|
						}}
							<span
								class="lt-marquee-glyph lt-glyph--{{g.kind}}"
							>{{g.glyph}}</span>
						{{/each}}
					</div>
				{{else}}
					<div
						class="lt-cells"
						aria-hidden="true"
					>
						{{#each
							this.cells key="index"
							as |cell|
						}}
							<div
								class="lt-cell
									{{if
										cell.shaded
										'lt-cell--shaded'
									}}
									{{if
										cell.selected
										'lt-cell--selected'
									}}"
								style={{cell.style}}
							>
								<span
									class="lt-glyph lt-glyph--{{cell.kind}}"
								>{{cell.glyph}}</span>
								{{#if
									@positions
								}}
									<span
										class="lt-position"
									>{{cell.position}}</span>
								{{/if}}
							</div>
						{{/each}}
						{{#if this.caretStyle}}
							<div
								class="lt-caret"
								style={{this.caretStyle}}
							></div>
						{{/if}}
					</div>
				{{/if}}
				<textarea
					class="lt-editor"
					aria-label="Text"
					placeholder="Type or paste"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					value={{@text}}
					{{this.track}}
					{{on "input" this.input}}
					{{on "click" this.place}}
				></textarea>
			</div>
		</div>
	</template>
}
