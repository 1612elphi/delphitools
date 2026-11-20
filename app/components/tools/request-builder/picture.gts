import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	PARTS,
	byteSize,
	wireLines,
	type WireLine,
} from 'delphitools-v2/components/tools/request-builder/wire';

const MAX_LINES = 12;
const NAMES = { start: 'Request line', headers: 'Headers', body: 'Body' };

interface Run {
	text: string;
	tone?: 'method' | 'name' | 'muted';
}

function runs(line: WireLine): Run[] {
	if (line.part === 'start') {
		const space = line.text.indexOf(' ');
		if (space < 0) return [{ text: line.text, tone: 'method' }];
		const rest = line.text.slice(space);
		const last = rest.lastIndexOf(' ');
		return last > 0
			? [
					{
						text: line.text.slice(0, space),
						tone: 'method',
					},
					{ text: rest.slice(0, last) },
					{
						text: rest.slice(last),
						tone: 'muted',
					},
				]
			: [
					{
						text: line.text.slice(0, space),
						tone: 'method',
					},
					{ text: rest },
				];
	}
	const colon = line.part === 'headers' ? line.text.indexOf(':') : -1;
	return colon < 0
		? [{ text: line.text }]
		: [
				{
					text: line.text.slice(0, colon),
					tone: 'name',
				},
				{ text: line.text.slice(colon) },
			];
}

const endings = { '\r\n': '␍␊', '\n': '␊', '': '' };

export default class Picture extends Component<{ Args: { message: string } }> {
	get wire() {
		return wireLines(this.args.message);
	}

	get size() {
		const { bytes } = this.wire;
		const [number, unit] = byteSize(
			bytes.start + bytes.headers + bytes.body,
		);
		return { number, unit };
	}

	get host() {
		const line = this.wire.lines.find(
			(l) => l.part === 'headers' && /^host:/i.test(l.text),
		);
		return line?.text.slice(5).trim();
	}

	get bars() {
		const { bytes } = this.wire;
		return PARTS.map((part) => ({
			part,
			name: NAMES[part],
			detail: `${bytes[part]} bytes`,
			empty: bytes[part] === 0,
			style: htmlSafe(
				`flex-grow: ${Math.max(1, bytes[part])}`,
			),
		}));
	}

	get listing() {
		const { lines } = this.wire;
		const shown =
			lines.length > MAX_LINES + 1
				? lines.slice(0, MAX_LINES)
				: lines;
		return {
			lines: shown.map((line) => ({
				part: line.part,
				offset: line.offset
					.toString(16)
					.padStart(4, '0'),
				runs: runs(line).map((run) => ({
					text: run.text,
					class: run.tone
						? `rq-run--${run.tone}`
						: undefined,
				})),
				ending: endings[line.ending],
			})),
			rest: lines.length - shown.length,
		};
	}

	get label() {
		return this.wire.lines[0]?.text ?? '';
	}

	<template>
		<figure class="rq-picture" aria-label={{this.label}}>
			<div class="rq-head">
				<CanonFigure
					@text={{this.size.number}}
					@unit={{this.size.unit}}
					@size={{34}}
					@halo="var(--canon-card)"
				/>
				<span class="rq-head-text">
					<span class="rq-version">HTTP/1.1</span>
					<span
						class="rq-host
							{{unless
								this.host
								'rq-host--none'
							}}"
					>
						{{~if this.host this.host "—"~}}
					</span>
				</span>
			</div>
			<div class="rq-bars">
				{{#each this.bars as |bar|}}
					<div
						class="rq-bar rq-part--{{bar.part}}
							{{if
								bar.empty
								'rq-bar--empty'
							}}"
						style={{bar.style}}
					>
						<span
							class="rq-bar-fill"
						></span>
						<span
							class="rq-bar-name"
						>{{bar.name}}</span>
						<span
							class="rq-bar-detail"
						>{{bar.detail}}</span>
					</div>
				{{/each}}
			</div>
			<div class="rq-listing">
				{{#each this.listing.lines as |line|}}
					<div
						class="rq-line rq-part--{{line.part}}"
					>
						<span
							class="rq-offset"
						>{{line.offset}}</span>
						<span class="rq-text">
							{{~#each
								line.runs
								as |run|
							~}}
								<span
									class={{run.class}}
								>{{run.text}}</span>
							{{~/each~}}
						</span>
						{{#if line.ending}}
							<span
								class="rq-ending"
							>{{line.ending}}</span>
						{{/if}}
					</div>
				{{/each}}
				{{#if this.listing.rest}}
					<div class="rq-line rq-line--more">
						<span class="rq-offset"></span>
						<span class="rq-text">⋯ +{{this.listing.rest}}</span>
					</div>
				{{/if}}
			</div>
		</figure>
	</template>
}
