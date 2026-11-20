import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import MarkedEditor, {
	reportHeight,
} from 'delphitools-v2/components/tools/media/marked-editor';
import type { GlossPiece } from 'delphitools-v2/components/tools/text-tool/gloss-pieces';
import PasteClear from 'delphitools-v2/components/tools/text-tool/paste-clear';
import './gloss.css';

interface GlossEditorSignature {
	Args: {
		text: string;
		pieces: GlossPiece[];
		selected: number | null;
		onInput: (text: string) => void;
		onWord: (index: number) => void;
		onHeight: (height: number) => void;
	};
	Blocks: { gloss: [piece: GlossPiece] };
}

export const collapsedHeight = 96;

function fit(text: HTMLElement) {
	const words = [...text.querySelectorAll<HTMLElement>('.gl-word')];
	const glosses = words.map((w) =>
		w.querySelector<HTMLElement>('.gl-gloss')!,
	);
	for (const gloss of glosses) gloss.style.inlineSize = '';
	const style = getComputedStyle(text);
	const lineEnd =
		text.getBoundingClientRect().right -
		parseFloat(style.paddingRight);
	const tail = 0.6 * parseFloat(style.fontSize);
	const boxes = words.map((word, i) => {
		const rect = word.getBoundingClientRect();
		return {
			left: rect.left,
			right: rect.right,
			top: Math.round(rect.top),
			needs: glosses[i]!.scrollWidth,
		};
	});
	const gap = 2;
	let start = 0;
	while (start < words.length) {
		let end = start + 1;
		while (
			end < words.length &&
			words[end - 1]!.nextElementSibling === words[end] &&
			boxes[end]!.top === boxes[start]!.top
		)
			end += 1;
		const next = boxes[end];
		const limit =
			next && next.top === boxes[start]!.top
				? next.left - gap
				: lineEnd;
		const origin = boxes[start]!.left;
		const at: number[] = [];
		let reach = origin;
		for (let i = start; i < end; i += 1) {
			at.push(Math.max(boxes[i]!.left, reach));
			reach = at.at(-1)! + boxes[i]!.needs;
		}
		const last = boxes[end - 1]!;
		const scale =
			reach > limit ? (limit - origin) / (reach - origin) : 1;
		const place = (x: number) => origin + (x - origin) * scale;
		for (let i = start; i < end; i += 1) {
			const x = place(at[i - start]!);
			const until =
				i + 1 < end
					? place(at[i + 1 - start]!)
					: Math.min(
							limit,
							Math.max(
								place(reach),
								last.right +
									tail,
							),
						);
			const gloss = glosses[i]!;
			gloss.style.setProperty(
				'--gl-shift',
				`${x - boxes[i]!.left}px`,
			);
			gloss.style.setProperty('--gl-fit', String(scale));
			gloss.style.inlineSize = `${(until - x) / scale}px`;
		}
		start = end;
	}
}

// ponytail: reads every word on each change; a pasted book re-fits in one pass
const fitGlosses = modifier((text: HTMLElement, [pieces]: [GlossPiece[]]) => {
	void pieces;
	let live = true;
	fit(text);
	if (document.fonts.status !== 'loaded')
		void document.fonts.ready.then(() => {
			if (live) fit(text);
		});
	let width = text.offsetWidth;
	const observer = new ResizeObserver(() => {
		if (text.offsetWidth === width) return;
		width = text.offsetWidth;
		fit(text);
	});
	observer.observe(text);
	return () => {
		live = false;
		observer.disconnect();
	};
});

export default class GlossEditor extends Component<GlossEditorSignature> {
	get trailingLine() {
		return this.args.text.endsWith('\n');
	}

	<template>
		<div class="gl-picture">
			<div class="gl-picture-head">
				<span class="gl-picture-heading">English</span>
				<span class="gl-picture-tools">
					<PasteClear
						@text={{@text}}
						@onChange={{@onInput}}
						@cells={{true}}
					/>
				</span>
			</div>
			<div class="gl-picture-scroll">
				<MarkedEditor
					class="gl-picture-text"
					@text={{@text}}
					@placeholder="Type or paste"
					@label="English input"
					@interactive={{true}}
					@prose={{true}}
					@onInput={{@onInput}}
					{{reportHeight @onHeight}}
					{{fitGlosses @pieces}}
				>
					{{~#each
						@pieces key="@index"
						as |piece|
					~}}
						{{~#if (isWord piece)~}}
							<span
								class="gl-word
									{{if
										piece.guess
										'gl-word--guess'
									}}
									{{if
										(isLit
											piece
											@selected
										)
										'gl-word--lit'
									}}"
							><span
									aria-hidden="true"
								>{{piece.text}}</span><button
									type="button"
									class="gl-gloss"
									aria-label={{piece.text}}
									aria-pressed={{if
										(isLit
											piece
											@selected
										)
										"true"
										"false"
									}}
									{{on
										"click"
										(fn
											@onWord
											piece.index
										)
									}}
								><span
										class="gl-gloss-marker"
									>{{piece.marker}}</span>{{~#if
										(has-block
											"gloss"
										)
									~}}{{~yield
											piece
											to="gloss"
										~}}{{~else~}}{{piece.gloss}}{{~/if~}}</button></span>
						{{~else if piece.gloss~}}
							<span
								class="gl-word gl-word--mark"
								aria-hidden="true"
							>{{piece.text}}<span
									class="gl-gloss"
								>{{piece.gloss}}</span></span>
						{{~else~}}
							<span
								aria-hidden="true"
							>{{piece.text}}</span>
						{{~/if~}}
					{{~/each~}}
					{{~#if this.trailingLine~}}
						<span aria-hidden="true">
						</span>
					{{~/if~}}
				</MarkedEditor>
			</div>
		</div>
	</template>
}

function isWord(piece: GlossPiece) {
	return piece.kind === 'word';
}

function isLit(piece: GlossPiece, selected: number | null) {
	return piece.index === selected;
}
