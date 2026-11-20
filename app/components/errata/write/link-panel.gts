import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import CanonRow from 'delphicanon/components/canon-row';
import 'delphicanon/components/canon-text-cell.css';
import ToolPanel, {
	focusOnOpen,
	readText,
} from 'delphitools-v2/components/errata/tool-panel';
import { linkAt, setLink } from 'delphitools-v2/lib/errata/write/editor';
import { commonChar } from 'delphitools-v2/lib/errata/write/model';
import {
	writeStore,
	type WriteState,
} from 'delphitools-v2/lib/errata/write/store';
import {
	closePanel,
	isPanel,
	writePanel,
} from 'delphitools-v2/lib/errata/write/view';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

function current(s: WriteState | null): string | undefined {
	if (!s) return undefined;
	return commonChar(s.doc, s.sel).link ?? linkAt(s.doc, s.sel.focus);
}

export default class LinkPanel extends Component {
	open = new TrackedExternal(writePanel.subscribe, isPanel('link'));
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);
	@tracked invalid = false;
	#url = '';

	willDestroy() {
		super.willDestroy();
		this.open.unsubscribe();
		this.state.unsubscribe();
	}

	get linked() {
		return current(this.state.current) !== undefined;
	}

	prime = (el: HTMLInputElement) => {
		this.#url = el.value = current(writeStore.get()) ?? '';
	};

	close = () => {
		this.invalid = false;
		closePanel();
	};

	setUrl = (url: string) => {
		this.#url = url;
		this.invalid = false;
	};

	apply = () => {
		if (setLink(this.#url)) this.close();
		else this.invalid = true;
	};

	remove = () => {
		setLink(null);
		this.close();
	};

	onKey = (event: KeyboardEvent) => {
		if (event.key === 'Enter') this.apply();
		else if (event.key === 'Escape') this.close();
		else return;
		event.preventDefault();
	};

	<template>
		<ToolPanel
			@open={{this.open.current}}
			@mode="write-link"
			@label="Link"
			@onCancel={{this.close}}
			@onApply={{this.apply}}
			@applyLabel="Link"
		>
			<:actions>
				{{#if this.linked}}
					<Cell
						@label="Remove link"
						@text="Remove link"
						data-link="remove"
						@onClick={{this.remove}}
					/>
				{{/if}}
			</:actions>
			<:default>
				<CanonRow @title="URL" @form="flush">
					<input
						class="canon-text-cell"
						aria-label="URL"
						aria-invalid={{if
							this.invalid
							"true"
							"false"
						}}
						inputmode="url"
						autocomplete="off"
						spellcheck="false"
						data-link="url"
						{{focusOnOpen
							this.open.current
							onOpen=this.prime
						}}
						{{on
							"input"
							(readText this.setUrl)
						}}
						{{on "keydown" this.onKey}}
					/>
				</CanonRow>
			</:default>
		</ToolPanel>
	</template>
}
