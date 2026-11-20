import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	fieldNames,
	firstWeekday,
	initialState,
	issueText,
	parseOf,
	parsedOf,
	withBox,
	withField,
	withMode,
	withSub,
	type CronState,
	type Mode,
	type SubKey,
} from 'delphitools-v2/components/tools/cron-builder/cron';
import Field from 'delphitools-v2/components/tools/cron-builder/field';
import Rails from 'delphitools-v2/components/tools/cron-builder/rails';
import {
	describeCron,
	FIELD_RULES,
	nextRuns,
	type FieldKind,
} from 'delphitools-v2/lib/cron';
import './cron-builder/cron-builder.css';

const arityWarning =
	'A cron expression has five fields: minute, hour, day, month, weekday';
const runCount = 5;

const CopyIcon = <template><IconSvg @name="copy" /></template>;

const runFormat = new Intl.DateTimeFormat(undefined, {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
});

const selectAll = (event: FocusEvent) => {
	const field = event.target;
	if (field instanceof HTMLInputElement)
		requestAnimationFrame(() => field.select());
};

export default class CronBuilder extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked state: CronState = initialState();
	@tracked field: number | null = 0;
	@tracked now = new Date();
	@tracked minute = Math.floor(Date.now() / 60_000);

	firstDay = firstWeekday();
	#ticker?: number;
	#focus?: string;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const expr = query.get('cronExpr');
		if (expr !== null) this.state = withBox(initialState(), expr);
		if (query.has('cronField'))
			this.field = Math.min(
				Math.max(
					Number(query.get('cronField')) || 0,
					0,
				),
				4,
			);
		this.#focus = query.get('cronFocus') ?? undefined;
		this.#ticker = window.setInterval(() => this.#tick(), 1000);
	}

	willDestroy() {
		super.willDestroy();
		window.clearInterval(this.#ticker);
	}

	#tick() {
		this.now = new Date();
		const minute = Math.floor(this.now.getTime() / 60_000);
		if (minute !== this.minute) this.minute = minute;
	}

	focusOnLaunch = modifier((root: HTMLElement) => {
		if (!this.#focus) return;
		const target =
			this.#focus === 'field'
				? root.querySelector<HTMLElement>(
						'.cron-field--open .cron-field-source',
					)
				: root.querySelector<HTMLElement>(
						'.cron-expression',
					);
		requestAnimationFrame(() => target?.focus());
		this.#focus = undefined;
	});

	get parsed() {
		return parsedOf(this.state);
	}

	get expressionStyle() {
		const size = Math.max(
			17,
			Math.min(28, 530 / Math.max(1, this.state.box.length)),
		);
		return htmlSafe(`font-size: ${Math.floor(size)}px`);
	}

	get arityError() {
		return this.parsed.fieldCount !== 5;
	}

	get arityWarning() {
		return arityWarning;
	}

	get canonical() {
		return this.parsed.ok ? this.parsed.expression : null;
	}

	get description() {
		return this.parsed.ok ? describeCron(this.parsed.fields) : null;
	}

	get timeZone() {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	}

	get runsHeading() {
		return `Next runs · ${this.timeZone}`;
	}

	@cached
	get upcoming(): Date[] {
		const { parsed } = this;
		if (!parsed.ok) return [];
		return nextRuns(
			parsed,
			runCount + 1,
			new Date(this.minute * 60_000),
		);
	}

	get runs() {
		return this.upcoming
			.filter((run) => run > this.now)
			.slice(0, runCount);
	}

	get next() {
		return this.runs[0];
	}

	get runLines() {
		return this.runs.map((run, i) => ({
			index: String(i + 1).padStart(2, '0'),
			text: runFormat.format(run),
		}));
	}

	get when() {
		return this.next ? runFormat.format(this.next) : undefined;
	}

	get pictureLabel() {
		return this.description ?? 'Errors';
	}

	@cached
	get fields() {
		const { state, arityError, parsed } = this;
		return FIELD_RULES.map((rule, index) => {
			const parse = parseOf(state, rule.kind);
			const fieldParse = parsed.fields[index];
			return {
				index,
				kind: rule.kind,
				name: fieldNames[index]!,
				source: state.fields[rule.kind],
				parse,
				subs: state.subs[rule.kind],
				editable: !arityError,
				issue:
					fieldParse && !fieldParse.ok
						? issueText(fieldParse.error)
						: undefined,
			};
		});
	}

	get timeFields() {
		return this.fields.slice(0, 2);
	}

	get dateFields() {
		return this.fields.slice(2);
	}

	get errors() {
		const { parsed } = this;
		if (parsed.ok || parsed.fieldCount !== 5) return [];
		return parsed.fields.flatMap((f, i) =>
			f.ok
				? []
				: [
						`${FIELD_RULES[i]!.label} · ${issueText(f.error)}`,
					],
		);
	}

	typeBox = (text: string) => {
		this.state = withBox(this.state, text);
	};

	toggle = (index: number) => {
		this.field = this.field === index ? null : index;
	};

	open = (index: number) => {
		this.field = index;
	};

	typeField = (kind: FieldKind, text: string) => {
		this.state = withField(this.state, kind, text);
	};

	setMode = (kind: FieldKind, mode: Mode) => {
		this.state = withMode(this.state, kind, mode);
	};

	setNumber = (kind: FieldKind, key: SubKey, value: number) => {
		this.state = withSub(this.state, kind, key, value);
	};

	copy = () => {
		if (this.canonical) void this.toast.copy(this.canonical);
	};

	<template>
		<CanonSplit class="cron-builder" {{this.focusOnLaunch}}>
			<:banner>
				<CanonCanvas @fitting={{true}}>
					<Rails
						@parsed={{this.parsed}}
						@field={{this.field}}
						@next={{this.next}}
						@now={{this.now}}
						@when={{this.when}}
						@label={{this.pictureLabel}}
						@firstDay={{this.firstDay}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Expression" />
					<CanonTextCell
						class="cron-expression"
						style={{this.expressionStyle}}
						@value={{this.state.box}}
						@placeholder="* * * * *"
						@onChange={{this.typeBox}}
						aria-label="Expression"
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						{{on "focusin" selectAll}}
					/>
					{{#if this.arityError}}
						<CanonStatus
							@text={{this.arityWarning}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Time" />
					{{#each
						this.timeFields key="kind"
						as |f|
					}}
						<Field
							@kind={{f.kind}}
							@name={{f.name}}
							@source={{f.source}}
							@parse={{f.parse}}
							@subs={{f.subs}}
							@editable={{f.editable}}
							@issue={{f.issue}}
							@open={{isOpen
								this.field
								f.index
							}}
							@onToggle={{fn
								this.toggle
								f.index
							}}
							@onOpen={{fn
								this.open
								f.index
							}}
							@onType={{fn
								this.typeField
								f.kind
							}}
							@onMode={{fn
								this.setMode
								f.kind
							}}
							@onNumber={{fn
								this.setNumber
								f.kind
							}}
						/>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Date" />
					{{#each
						this.dateFields key="kind"
						as |f|
					}}
						<Field
							@kind={{f.kind}}
							@name={{f.name}}
							@source={{f.source}}
							@parse={{f.parse}}
							@subs={{f.subs}}
							@editable={{f.editable}}
							@issue={{f.issue}}
							@open={{isOpen
								this.field
								f.index
							}}
							@onToggle={{fn
								this.toggle
								f.index
							}}
							@onOpen={{fn
								this.open
								f.index
							}}
							@onType={{fn
								this.typeField
								f.kind
							}}
							@onMode={{fn
								this.setMode
								f.kind
							}}
							@onNumber={{fn
								this.setNumber
								f.kind
							}}
						/>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonButton
						class="cron-copy"
						@text="Copy"
						@icon={{CopyIcon}}
						@iconStyle="oversized"
						@kind="primary"
						@disabled={{if
							this.canonical
							false
							true
						}}
						@onClick={{this.copy}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				{{#if this.canonical}}
					<CanonRows
						class="cron-schedule"
						@framed={{true}}
					>
						<CanonHeading
							@text="Schedule"
						/>
						<p
							class="cron-sentence"
						>{{this.description}}</p>
						<CanonValueLine
							class="cron-canonical"
							@label="Canonical"
							@value={{this.canonical}}
							@layout="above"
						/>
						<CanonHeading
							@text={{this.runsHeading}}
						/>
						{{#each this.runLines as |run|}}
							<CanonValueLine
								class="cron-run"
								@label={{run.index}}
								@value={{run.text}}
								@layout="numbered"
							/>
						{{else}}
							<CanonEmptyRow
								@text="Never"
							/>
						{{/each}}
					</CanonRows>
				{{else}}
					<CanonRows
						class="cron-errors"
						@framed={{true}}
					>
						<CanonHeading @text="Errors" />
						{{#if this.arityError}}
							<CanonStatus
								@text={{this.arityWarning}}
								@tone="warn"
								@row={{true}}
							/>
						{{else}}
							{{#each
								this.errors
								as |error|
							}}
								<CanonStatus
									@text={{error}}
									@tone="warn"
									@row={{true}}
								/>
							{{/each}}
						{{/if}}
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}

function isOpen(field: number | null, index: number) {
	return field === index;
}
