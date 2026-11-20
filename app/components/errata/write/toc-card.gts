import Component from '@glimmer/component';
import type { SafeString } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { Field, Segmented } from 'delphitools-v2/components/errata/tool-panel';
import { removeToc, setToc } from 'delphitools-v2/lib/errata/write/editor';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import type { Toc } from 'delphitools-v2/lib/errata/write/types';
import { focusEditor } from 'delphitools-v2/lib/errata/write/view';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const LEVELS = [1, 2, 3].map((value) => ({ value }));

export default class TocCard extends Component<{
	Args: { style: SafeString };
}> {
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
	}

	get toc(): Toc | undefined {
		return this.state.current?.doc.blocks.find(
			(b): b is Toc => b.kind === 'toc',
		);
	}

	isolate = modifier((el: HTMLElement) => {
		const stop = (e: Event) => e.stopPropagation();
		el.addEventListener('pointerdown', stop);
		return () => el.removeEventListener('pointerdown', stop);
	});

	setLevels = (levels: number) => {
		setToc({ levels });
		focusEditor();
	};

	setAfter = (after: boolean) => {
		setToc({ after: after || undefined });
		focusEditor();
	};

	remove = () => {
		removeToc();
		focusEditor();
	};

	<template>
		{{#if this.toc}}
			<div
				class="err-write-toc-card"
				style={{@style}}
				role="group"
				aria-label="Contents"
				data-toc-card
				{{this.isolate}}
			>
				<CanonRows>
					<Field @label="Levels">
						<Segmented
							@options={{LEVELS}}
							@value={{this.toc.levels}}
							@onChange={{this.setLevels}}
							@label="Levels"
							data-toc="levels"
						/>
					</Field>
					<CanonRow
						@title="Only later headings"
						as |id|
					>
						<CanonSwitch
							aria-labelledby={{id}}
							@on={{if
								this.toc.after
								true
								false
							}}
							@onChange={{this.setAfter}}
							data-toc="after"
						/>
					</CanonRow>
					<CanonButton
						@kind="segment"
						@text="Remove"
						data-toc="remove"
						@onClick={{this.remove}}
					/>
				</CanonRows>
			</div>
		{{/if}}
	</template>
}
