import Component from '@glimmer/component';
import { array, fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	HTTP_STATUSES,
	STATUS_CLASSES,
	statusFacts,
	type HttpStatus,
} from 'delphitools-v2/lib/http-status';

interface ChartSignature {
	Args: {
		selected: HttpStatus;
		matches: Set<number>;
		onSelect: (code: number) => void;
	};
}

const table = STATUS_CLASSES.map((info) => ({
	label: `${info.class}xx`,
	statuses: HTTP_STATUSES.filter((status) => status.class === info.class),
}));

export default class Chart extends Component<ChartSignature> {
	get facts() {
		return statusFacts(this.args.selected).slice(1);
	}

	get rows() {
		const { selected, matches } = this.args;
		return table.map((row) => ({
			label: row.label,
			tiles: row.statuses.map((status) => ({
				code: status.code,
				name: `${status.code} ${status.phrase}`,
				lit: status.code === selected.code,
				match: matches.has(status.code),
				standard: status.registered === 'standard',
			})),
		}));
	}

	<template>
		<div class="hs-chart">
			<div class="hs-chart-head">
				<CanonFigure
					@text="{{@selected.code}}"
					@size={{44}}
					@halo="var(--canon-card)"
				/>
				<div class="hs-chart-text">
					{{#each
						(array @selected.phrase)
						as |phrase|
					}}
						<p
							class="hs-chart-phrase"
						>{{phrase}}</p>
					{{/each}}
					<p class="hs-chart-meta">
						<a
							class="hs-chart-ref"
							href={{@selected.url}}
							target="_blank"
							rel="noopener noreferrer"
						>{{@selected.ref}}</a>
						{{~#each this.facts as |fact|~}}
							<span> · {{fact}}</span>
						{{~/each~}}
					</p>
				</div>
			</div>
			<div class="hs-chart-table">
				{{#each this.rows as |row|}}
					<span
						class="hs-chart-class"
						aria-hidden="true"
					>{{row.label}}</span>
					<div class="hs-chart-tiles">
						{{#each row.tiles as |tile|}}
							<button
								type="button"
								class="hs-tile
									{{if
										tile.lit
										'hs-tile--lit'
									}}
									{{if
										tile.match
										'hs-tile--match'
									}}
									{{unless
										tile.standard
										'hs-tile--outside'
									}}"
								aria-label={{tile.name}}
								aria-pressed={{if
									tile.lit
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										@onSelect
										tile.code
									)
								}}
							>{{tile.code}}</button>
						{{/each}}
					</div>
				{{/each}}
			</div>
		</div>
	</template>
}
