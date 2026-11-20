import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	allZones,
	city,
	commonZones,
	offset,
	regions,
	title,
} from 'delphitools-v2/components/tools/time-calc/time';

interface ZoneCellSignature {
	Args: {
		zone?: string;
		date: Date;
		placeholder?: string;
		label?: string;
		labelledBy?: string;
		disabled?: boolean;
		onPick: (zone: string) => void;
	};
	Element: HTMLDivElement;
}

let everyZone: string[] | undefined;
const quarterMs = 15 * 60 * 1000;

interface Group {
	region: string;
	entries: { id: string; text: string; selected: boolean }[];
}

let last: { quarter: number; groups: Group[] } | undefined;

function listed(quarter: number): Group[] {
	if (last?.quarter === quarter) return last.groups;
	everyZone ??= allZones();
	const at = new Date(quarter * quarterMs);
	const groups = regions(everyZone).map(({ region, entries }) => ({
		region,
		entries: entries.map((entry) => ({
			id: entry.zone,
			text: `${entry.name} · ${offset(entry.zone, at)}`,
			selected: false,
		})),
	}));
	last = { quarter, groups };
	return groups;
}

export default class ZoneCell extends Component<ZoneCellSignature> {
	get shown() {
		const { zone, date } = this.args;
		return zone ? title(zone, date) : undefined;
	}

	get common() {
		const { zone, date } = this.args;
		return commonZones.map((id) => ({
			id,
			text: `${city(id)} · ${offset(id, date)}`,
			selected: id === zone,
		}));
	}

	get groups(): Group[] {
		const { zone, date } = this.args;
		const groups = listed(Math.floor(date.getTime() / quarterMs));
		if (!zone || commonZones.includes(zone)) return groups;
		const marked = groups.map((group) => ({
			region: group.region,
			entries: group.entries.map((entry) =>
				entry.id === zone
					? { ...entry, selected: true }
					: entry,
			),
		}));
		return groups.some((group) =>
			group.entries.some((entry) => entry.id === zone),
		)
			? marked
			: [
					...marked,
					{
						region: '',
						entries: [
							{
								id: zone,
								text: zone,
								selected: true,
							},
						],
					},
				];
	}

	pick = (event: Event) => {
		const select = event.target as HTMLSelectElement;
		const { value } = select;
		if (!this.args.zone) select.value = '';
		if (value && value !== this.args.zone) this.args.onPick(value);
	};

	<template>
		<div
			class="canon-menu-cell tc-zone-cell
				{{if @disabled 'canon-menu-cell--disabled'}}"
			...attributes
		>
			<span class="canon-menu-cell-title">{{if
					this.shown
					this.shown
					@placeholder
				}}</span>
			<span
				class="canon-menu-cell-icon"
				aria-hidden="true"
			><IconSvg @name="chevrons-up-down" /></span>
			{{! template-lint-disable require-input-label }}
			<select
				class="canon-menu-cell-select"
				aria-labelledby={{@labelledBy}}
				aria-label={{@label}}
				disabled={{@disabled}}
				{{on "change" this.pick}}
			>
				{{#unless @zone}}
					<option
						value=""
						disabled
						selected
						hidden
					>{{@placeholder}}</option>
				{{/unless}}
				{{#each this.common key="id" as |choice|}}
					<option
						value={{choice.id}}
						selected={{choice.selected}}
					>{{choice.text}}</option>
				{{/each}}
				{{#each this.groups key="region" as |group|}}
					{{#if group.region}}
						<optgroup
							label={{group.region}}
						>
							{{#each
								group.entries
								key="id"
								as |choice|
							}}
								<option
									value={{choice.id}}
									selected={{choice.selected}}
								>{{choice.text}}</option>
							{{/each}}
						</optgroup>
					{{else}}
						{{#each
							group.entries key="id"
							as |choice|
						}}
							<option
								value={{choice.id}}
								selected={{choice.selected}}
							>{{choice.text}}</option>
						{{/each}}
					{{/if}}
				{{/each}}
			</select>
		</div>
	</template>
}
