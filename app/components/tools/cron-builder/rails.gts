import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	cellsOf,
	fieldNames,
	issueText,
	spanOf,
	valuesAt,
} from 'delphitools-v2/components/tools/cron-builder/cron';
import { FIELD_RULES, type CronParse } from 'delphitools-v2/lib/cron';

interface RailsSignature {
	Args: {
		parsed: CronParse;
		field: number | null;
		next?: Date;
		now: Date;
		when?: string;
		label: string;
		firstDay: number;
	};
}

const shortMonth = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	timeZone: 'UTC',
});
const narrowMonth = new Intl.DateTimeFormat(undefined, {
	month: 'narrow',
	timeZone: 'UTC',
});
const shortDay = new Intl.DateTimeFormat(undefined, {
	weekday: 'short',
	timeZone: 'UTC',
});
const narrowDay = new Intl.DateTimeFormat(undefined, {
	weekday: 'narrow',
	timeZone: 'UTC',
});

function labels(kind: string, value: number): [string, string] {
	if (kind === 'month') {
		const date = Date.UTC(2001, value - 1, 1);
		return [shortMonth.format(date), narrowMonth.format(date)];
	}
	if (kind === 'dow') {
		const date = Date.UTC(2001, 0, 7 + value);
		return [shortDay.format(date), narrowDay.format(date)];
	}
	return [String(value), String(value)];
}

export default class Rails extends Component<RailsSignature> {
	get span() {
		const { next, now } = this.args;
		if (!next) return undefined;
		return spanOf(
			Math.max(0, (next.getTime() - now.getTime()) / 1000),
		);
	}

	get figure() {
		return this.span?.[0] ?? '—';
	}

	get unit() {
		return this.span?.[1];
	}

	get figureColour() {
		return this.span
			? 'var(--canon-primary)'
			: 'var(--canon-muted-foreground)';
	}

	get never() {
		return !this.args.next && this.args.parsed.ok;
	}

	get when() {
		if (this.args.when) return this.args.when;
		return this.never ? 'Never' : '—';
	}

	@cached
	get rails() {
		const { parsed, field, next, firstDay } = this.args;
		const fields = parsed.fieldCount === 5 ? parsed.fields : [];
		const nextValues = next ? valuesAt(next) : undefined;
		return FIELD_RULES.map((rule, index) => {
			const parse = fields[index];
			const failed = parse ? !parse.ok : false;
			const blank = !parse || failed;
			const kept = new Set(parse?.ok ? parse.values : []);
			return {
				kind: rule.kind,
				name: fieldNames[index]!,
				chosen: index === field,
				failed,
				blank,
				detail: !parse
					? ''
					: parse.ok
						? parse.canon
						: issueText(parse.error),
				cells: cellsOf(rule.kind, firstDay).map(
					(value) => {
						const [long, short] = labels(
							rule.kind,
							value,
						);
						const isNext =
							nextValues?.[index] ===
							value;
						return {
							long,
							short,
							tone: blank
								? 'blank'
								: isNext
									? 'next'
									: kept.has(
												value,
										  )
										? 'kept'
										: 'off',
						};
					},
				),
			};
		});
	}

	get either() {
		const { parsed } = this.args;
		if (parsed.fieldCount !== 5) return false;
		const dom = parsed.fields[2];
		const dow = parsed.fields[4];
		return !!(dom?.ok && dow?.ok && !dom.any && !dow.any);
	}

	<template>
		<figure class="cron-rails" aria-label={{@label}}>
			<div class="cron-head">
				<CanonFigure
					@text={{this.figure}}
					@unit={{this.unit}}
					@size={{34}}
					@colour={{this.figureColour}}
					@halo="var(--canon-card)"
				/>
				<div class="cron-head-text">
					<span class="cron-head-caption">Next run</span>
					<span
						class="cron-head-when
							{{if
								this.never
								'cron-head-when--never'
							}}
							{{unless
								@next
								'cron-head-when--none'
							}}"
					>{{this.when}}</span>
				</div>
			</div>
			<div
				class="cron-rail-list
					{{if
						this.either
						'cron-rail-list--either'
					}}"
				aria-hidden="true"
			>
				{{#each this.rails as |rail|}}
					<div
						class="cron-rail cron-rail--{{rail.kind}}
							{{if
								rail.chosen
								'cron-rail--chosen'
							}}
							{{if
								rail.failed
								'cron-rail--failed'
							}}
							{{if
								rail.blank
								'cron-rail--blank'
							}}"
					>
						<div class="cron-rail-top">
							<span
								class="cron-rail-name"
							>{{rail.name}}</span>
							<span
								class="cron-rail-detail"
							>{{rail.detail}}</span>
						</div>
						<div class="cron-cells">
							{{#each
								rail.cells
								as |cell|
							}}
								<span
									class="cron-cell cron-cell--{{cell.tone}}"
								><span
										class="cron-cell-long"
									>{{cell.long}}</span><span
										class="cron-cell-short"
									>{{cell.short}}</span></span>
							{{/each}}
						</div>
					</div>
				{{/each}}
				{{#if this.either}}
					<span class="cron-either"></span>
				{{/if}}
			</div>
		</figure>
	</template>
}
