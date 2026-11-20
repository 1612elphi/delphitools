import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import type { SafeString } from '@ember/template';
import { modifier } from 'ember-modifier';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import { TOGGLES } from 'delphitools-v2/components/errata/write/format-bar';
import {
	barChar,
	editStore,
	formatChar,
	run,
} from 'delphitools-v2/lib/errata/write/editor';
import { clearFormatting } from 'delphitools-v2/lib/errata/write/model';
import { focusEditor, writePanel } from 'delphitools-v2/lib/errata/write/view';
import type { CharProps } from 'delphitools-v2/lib/errata/write/types';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class SelectionBar extends Component<{
	Args: { style: SafeString };
}> {
	state = new TrackedExternal(editStore.subscribe, editStore.get);

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
	}

	get toggles() {
		const s = this.state.current;
		const c: CharProps = s ? barChar(s) : {};
		return TOGGLES.map(([key, label, icon, text]) => ({
			key,
			label,
			icon,
			text: icon ? undefined : text,
			on: c[key] === true,
		}));
	}

	isolate = modifier((el: HTMLElement) => {
		const stop = (e: Event) => e.stopPropagation();
		el.addEventListener('pointerdown', stop);
		return () => el.removeEventListener('pointerdown', stop);
	});

	toggle = (key: keyof CharProps, on: boolean) => {
		formatChar({ [key]: !on });
		focusEditor();
	};

	link = () => writePanel.set('link');

	clear = () => {
		run((d, s) => clearFormatting(d, s));
		focusEditor();
	};

	<template>
		<div
			class="err-write-selection-bar"
			style={{@style}}
			data-selection-bar
			{{this.isolate}}
		>
			<Cells @axis="row" @small={{true}}>
				{{#each this.toggles as |t|}}
					<Cell
						@label={{t.label}}
						@icon={{t.icon}}
						@text={{t.text}}
						@selected={{t.on}}
						@tip="top"
						data-toggle={{t.key}}
						@onClick={{fn
							this.toggle
							t.key
							t.on
						}}
					/>
				{{/each}}
				<Cell
					@label="Link"
					@icon="link"
					@tip="top"
					@onClick={{this.link}}
				/>
				<Cell
					@label="Clear formatting"
					@icon="eraser"
					@tip="top"
					data-selection="clear"
					@onClick={{this.clear}}
				/>
			</Cells>
		</div>
	</template>
}
