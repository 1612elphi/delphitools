import Component from '@glimmer/component';
import { guidFor } from '@ember/object/internals';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	boundsOf,
	modeOf,
	modes,
	modeTitles,
	nameOf,
	summaryOf,
	type Mode,
	type SubKey,
	type Subs,
} from 'delphitools-v2/components/tools/cron-builder/cron';
import type { FieldKind, FieldParse } from 'delphitools-v2/lib/cron';

interface FieldSignature {
	Args: {
		kind: FieldKind;
		name: string;
		source: string;
		parse: FieldParse;
		subs: Subs;
		editable: boolean;
		issue?: string;
		open: boolean;
		onToggle: () => void;
		onOpen: () => void;
		onType: (text: string) => void;
		onMode: (mode: Mode) => void;
		onNumber: (key: SubKey, value: number) => void;
	};
}

const Chevron = <template><IconSvg @name="chevron-down" /></template>;

export default class Field extends Component<FieldSignature> {
	panelId = `${guidFor(this)}-panel`;

	get modeTitles() {
		return modeTitles;
	}

	get mode() {
		return this.args.editable ? modeOf(this.args.parse) : undefined;
	}

	get modeIndex() {
		return this.mode ? modes.indexOf(this.mode) : -1;
	}

	get detail() {
		const { editable, issue, parse, kind } = this.args;
		if (!editable) return '—';
		return issue ?? summaryOf(parse, kind);
	}

	get failed() {
		return this.args.editable && !!this.args.issue;
	}

	get shownSource() {
		return this.args.editable ? this.args.source : '';
	}

	get numbers() {
		const { kind, subs } = this.args;
		const row = (key: SubKey, title: string) => {
			const [min, max] = boundsOf(kind, key);
			return {
				key,
				title,
				value: subs[key],
				min,
				max,
				detail:
					key === 'step'
						? undefined
						: nameOf(subs[key], kind),
			};
		};
		switch (this.mode) {
			case 'value':
				return [row('value', 'Value')];
			case 'range':
				return [row('lo', 'From'), row('hi', 'To')];
			case 'step':
				return [row('step', 'Every')];
			default:
				return [];
		}
	}

	setMode = (index: number) => {
		const mode = modes[index];
		if (mode) this.args.onMode(mode);
	};

	<template>
		<div
			class="cron-field
				{{if @open 'cron-field--open'}}
				{{if this.failed 'cron-field--failed'}}"
		>
			<button
				type="button"
				class="cron-field-face"
				aria-expanded={{if @open "true" "false"}}
				aria-controls={{this.panelId}}
				{{on "click" @onToggle}}
			>
				<span class="cron-field-words">
					<span
						class="cron-field-name"
					>{{@name}}</span>
					<span
						class="cron-field-detail"
					>{{this.detail}}</span>
				</span>
				<span
					class="cron-field-chevron"
					aria-hidden="true"
				><Chevron /></span>
			</button>
			<CanonTextCell
				class="cron-field-source"
				@value={{this.shownSource}}
				@placeholder="*"
				@onChange={{@onType}}
				disabled={{if @editable false true}}
				aria-label={{@name}}
				aria-invalid={{if this.failed "true"}}
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				{{on "focusin" @onOpen}}
			/>
		</div>
		{{#if @open}}
			<div id={{this.panelId}} class="cron-field-panel">
				<CanonSegmented
					aria-label="Mode"
					@items={{this.modeTitles}}
					@selected={{this.modeIndex}}
					@columns={{4}}
					@disabled={{if @editable false true}}
					@onChange={{this.setMode}}
				/>
				{{#each this.numbers key="key" as |number|}}
					<CanonRow
						class="cron-number"
						@title={{number.title}}
						@detail={{number.detail}}
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{number.value}}
							@min={{number.min}}
							@max={{number.max}}
							@labelledBy={{titleId}}
							@onChange={{fn
								@onNumber
								number.key
							}}
						/>
					</CanonRow>
				{{/each}}
			</div>
		{{/if}}
	</template>
}
