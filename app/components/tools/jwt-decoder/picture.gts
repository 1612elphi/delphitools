import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import CanonButton from 'delphicanon/components/canon-button';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import MarkedEditor, {
	reportHeight,
} from 'delphitools-v2/components/tools/media/marked-editor';
import type { JwtResult } from 'delphitools-v2/lib/jwt';
import {
	STATE_WORDS,
	jwtState,
	marks,
	duration,
	timeline,
	type Mark,
} from 'delphitools-v2/components/tools/jwt-decoder/anatomy';

interface PictureSignature {
	Args: {
		text: string;
		result: JwtResult;
		now: Date;
		onInput: (text: string) => void;
		onHeight: (height: number) => void;
	};
}

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

const names = ['Header', 'Payload', 'Signature'];
const stateColours = {
	valid: 'var(--canon-primary)',
	expired: 'var(--canon-destructive)',
	early: 'var(--canon-muted-foreground)',
};
const percent = (share: number) => `${(share * 100).toFixed(3)}%`;

function markClass(mark: Mark, failed: boolean[]) {
	if (mark.part === null) return undefined;
	if (mark.part === 'dot') return 'jwt-mark--dot';
	return `jwt-mark--${mark.part}${failed[mark.part] ? ' jwt-mark--failed' : ''}`;
}

export default class Picture extends Component<PictureSignature> {
	get decoded() {
		const { result } = this.args;
		return result.kind === 'decoded' ? result : undefined;
	}

	get segments() {
		const { result } = this.args;
		return result.kind === 'segments' ? result.found : undefined;
	}

	get segmentsText() {
		return `Segments ${this.segments} / 3`;
	}

	get state() {
		return this.decoded
			? jwtState(this.decoded, this.args.now)
			: null;
	}

	get figure() {
		const { state, decoded } = this;
		if (!state || !decoded) return undefined;
		const now = this.args.now.getTime() / 1000;
		const target =
			decoded.timeClaims.find(
				(c) =>
					c.key ===
					(state === 'early' ? 'nbf' : 'exp'),
			)?.seconds ?? now;
		const [number, unit] = duration(target - now);
		return {
			number,
			unit,
			word: STATE_WORDS[state],
			colour: stateColours[state],
			wordStyle: htmlSafe(`color: ${stateColours[state]}`),
		};
	}

	get failed() {
		const decoded = this.decoded;
		return decoded
			? [
					!!decoded.header.error,
					!!decoded.payload.error,
					!!decoded.signature.error,
				]
			: [false, false, false];
	}

	get runs() {
		const failed = this.failed;
		return marks(this.args.text).map((mark) => ({
			text: mark.text,
			class: markClass(mark, failed),
		}));
	}

	get parts() {
		const decoded = this.decoded;
		if (!decoded) return undefined;
		const segments = [
			decoded.header,
			decoded.payload,
			decoded.signature,
		];
		return segments.map((segment, index) => ({
			name: names[index],
			detail: segment.error ?? `${segment.bytes} bytes`,
			failed: !!segment.error,
			style: htmlSafe(
				`flex-grow: ${Math.max(1, segment.bytes ?? 1)}`,
			),
			tone: index,
		}));
	}

	get timeline() {
		const claims = this.decoded?.timeClaims ?? [];
		if (!claims.length) return undefined;
		const line = timeline(claims, this.args.now);
		const place = (share: number) =>
			htmlSafe(`--jwt-at: ${percent(share)}`);
		return {
			ticks: line.ticks.map((tick) => ({
				label: tick.label,
				style: place(tick.at),
				lower: tick.line === 1,
			})),
			band: line.band
				? htmlSafe(
						`inset-inline-start: ${percent(line.band.from)}; inline-size: max(2px, ${percent(line.band.to - line.band.from)})`,
					)
				: undefined,
			now: place(line.now),
			colour: htmlSafe(
				`--jwt-state: ${stateColours[this.state ?? 'valid']}`,
			),
			faded: this.state !== 'valid',
		};
	}

	get names() {
		return names;
	}

	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onInput(text);
	};

	clear = () => this.args.onInput('');

	<template>
		<div class="jwt-picture">
			<div class="jwt-picture-head">
				{{#if this.figure}}
					<span class="jwt-picture-figure">
						<CanonFigure
							@text={{this.figure.number}}
							@unit={{this.figure.unit}}
							@size={{26}}
							@colour={{this.figure.colour}}
						/>
						<span
							class="jwt-picture-word"
							style={{this.figure.wordStyle}}
						>{{this.figure.word}}</span>
					</span>
				{{else if this.segments}}
					<CanonStatus
						@text={{this.segmentsText}}
						@tone="warn"
					/>
				{{/if}}
				<span class="jwt-picture-tools">
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
			<div class="jwt-picture-scroll">
				<div
					class="jwt-picture-body"
					{{reportHeight @onHeight}}
				>
					<MarkedEditor
						class="jwt-token"
						@text={{@text}}
						@placeholder="Paste a JWT"
						@label="Token"
						@onInput={{@onInput}}
					>
						{{~#each this.runs as |run|~}}
							<span
								class={{run.class}}
							>{{run.text}}</span>
						{{~/each~}}
					</MarkedEditor>
					<div
						class="jwt-parts"
						aria-hidden="true"
					>
						{{#if this.parts}}
							{{#each
								this.parts
								as |part|
							}}
								<div
									class="jwt-part jwt-part--{{part.tone}}
										{{if
											part.failed
											'jwt-part--failed'
										}}"
									style={{part.style}}
								>
									<span
										class="jwt-part-bar"
									></span>
									<span
										class="jwt-part-name"
									>{{part.name}}</span>
									<span
										class="jwt-part-detail"
									>{{part.detail}}</span>
								</div>
							{{/each}}
						{{else}}
							{{#each
								this.names
								as |name|
							}}
								<div
									class="jwt-part jwt-part--empty"
								>
									<span
										class="jwt-part-bar"
									></span>
									<span
										class="jwt-part-name"
									>{{name}}</span>
								</div>
							{{/each}}
						{{/if}}
					</div>
					{{#if this.timeline}}
						<div
							class="jwt-timeline
								{{if
									this.timeline.faded
									'jwt-timeline--faded'
								}}"
							style={{this.timeline.colour}}
							aria-hidden="true"
						>
							<div
								class="jwt-timeline-labels"
							>
								{{#each
									this.timeline.ticks
									as |tick|
								}}
									<span
										class="jwt-timeline-label
											{{if
												tick.lower
												'jwt-timeline-label--lower'
											}}"
										style={{tick.style}}
									>{{tick.label}}</span>
								{{/each}}
							</div>
							<div
								class="jwt-timeline-axis"
							>
								{{#if
									this.timeline.band
								}}
									<span
										class="jwt-timeline-band"
										style={{this.timeline.band}}
									></span>
								{{/if}}
								{{#each
									this.timeline.ticks
									as |tick|
								}}
									<span
										class="jwt-timeline-tick"
										style={{tick.style}}
									></span>
								{{/each}}
								<span
									class="jwt-timeline-now"
									style={{this.timeline.now}}
								></span>
							</div>
							<div
								class="jwt-timeline-labels jwt-timeline-labels--now"
							>
								<span
									class="jwt-timeline-label jwt-timeline-label--now"
									style={{this.timeline.now}}
								>Now</span>
							</div>
						</div>
					{{/if}}
				</div>
			</div>
		</div>
	</template>
}
