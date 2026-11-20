import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSwitch from 'delphicanon/components/canon-switch';
import 'delphicanon/components/canon-text-cell.css';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import ToolPanel, {
	focusOnOpen,
	readText,
} from 'delphitools-v2/components/errata/tool-panel';
import {
	currentMatch,
	findQuery,
	matchesIn,
	replaceAll,
	replaceOne,
	step,
} from 'delphitools-v2/lib/errata/write/find';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { MOD, editStore } from 'delphitools-v2/lib/errata/write/editor';
import {
	closePanel,
	isPanel,
	writePanel,
} from 'delphitools-v2/lib/errata/write/view';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class FindPanel extends Component {
	state = new TrackedExternal(editStore.subscribe, editStore.get);
	query = new TrackedExternal(findQuery.subscribe, findQuery.get);
	open = new TrackedExternal(writePanel.subscribe, isPanel('find'));

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
		this.query.unsubscribe();
		this.open.unsubscribe();
	}

	@cached
	get count() {
		void this.state.current;
		void this.query.current;
		const s = writeStore.get();
		if (!s) return '0';
		const matches = matchesIn(s.doc);
		const i = currentMatch(matches);
		if (!matches.length) return '0';
		return i < 0
			? String(matches.length)
			: `${i + 1} / ${matches.length}`;
	}

	setQuery = (query: string) => {
		findQuery.set({ ...findQuery.get(), query });
		step(0);
	};

	setReplace = (replace: string) =>
		findQuery.set({ ...findQuery.get(), replace });

	setCase = (matchCase: boolean) => {
		findQuery.set({ ...findQuery.get(), matchCase });
		step(0);
	};

	next = () => step(1);
	prev = () => step(-1);

	onKey = (event: KeyboardEvent) => {
		const g = MOD(event) && event.key.toLowerCase() === 'g';
		if (event.key === 'Enter' || g) step(event.shiftKey ? -1 : 1);
		else if (event.key === 'Escape') closePanel();
		else if (MOD(event) && event.key.toLowerCase() === 'f')
			(event.target as HTMLInputElement).select();
		else return;
		event.preventDefault();
	};

	<template>
		<ToolPanel
			@open={{this.open.current}}
			@mode="write-find"
			@label="Find"
			@onCancel={{closePanel}}
			@cancelLabel="Done"
		>
			<:status>
				<span data-find-count>{{this.count}}</span>
			</:status>
			<:actions>
				<Cell
					@label="Previous"
					@icon="chevron-up"
					data-find="prev"
					@onClick={{this.prev}}
				/>
				<Cell
					@label="Next"
					@icon="chevron-down"
					data-find="next"
					@onClick={{this.next}}
				/>
				<Cell
					@label="Replace"
					@text="Replace"
					data-find="replace"
					@onClick={{replaceOne}}
				/>
				<Cell
					@label="Replace all"
					@text="All"
					data-find="all"
					@onClick={{replaceAll}}
				/>
			</:actions>
			<:default>
				<CanonRows class="err-write-setup-col">
					<CanonRow @title="Find" @form="flush">
						<input
							class="canon-text-cell"
							aria-label="Find"
							data-find="query"
							value={{this.query.current.query}}
							{{focusOnOpen
								this.open.current
							}}
							{{on
								"input"
								(readText
									this.setQuery
								)
							}}
							{{on
								"keydown"
								this.onKey
							}}
						/>
					</CanonRow>
					<CanonRow
						@title="Replace"
						@form="flush"
					>
						<input
							class="canon-text-cell"
							aria-label="Replace"
							data-find="with"
							value={{this.query.current.replace}}
							{{on
								"input"
								(readText
									this.setReplace
								)
							}}
							{{on
								"keydown"
								this.onKey
							}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows class="err-write-setup-col">
					<CanonRow @title="Match case" as |id|>
						<CanonSwitch
							@on={{this.query.current.matchCase}}
							@onChange={{this.setCase}}
							aria-labelledby={{id}}
						/>
					</CanonRow>
				</CanonRows>
			</:default>
		</ToolPanel>
	</template>
}
