import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import { setActiveTool } from 'delphitools-v2/lib/substrata/tool';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class EmptyHint extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);

	#fileInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
	}

	get hidden() {
		const doc = this.doc.current;
		return !doc || doc.layers.length > 0;
	}

	registerInput = modifier((element: HTMLInputElement) => {
		this.#fileInput = element;
		return () => {
			this.#fileInput = null;
		};
	});

	pickImage = () => this.#fileInput?.click();

	pickText = () => setActiveTool('text');

	onPick = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (files) {
			for (const f of Array.from(files)) {
				if (f.type.startsWith('image/'))
					void importImageFile(f);
			}
		}
		input.value = '';
	};

	<template>
		{{#unless this.hidden}}
			<div class="sub-empty-hint" data-empty-hint>
				<input
					type="file"
					accept="image/*"
					multiple
					class="dt-sr-only"
					aria-label="Add image"
					{{this.registerInput}}
					{{on "change" this.onPick}}
				/>
				{{! harness selectors }}
				<div
					class="sub-empty-card pointer-events-auto border shadow-lg"
				>
					<div
						class="segmented sub-empty-actions"
					>
						<button
							type="button"
							class="sub-empty-action"
							{{on
								"click"
								this.pickImage
							}}
						>
							<Icon
								@name="image-plus"
							/>
							Add image
						</button>
						<button
							type="button"
							class="sub-empty-action"
							{{on
								"click"
								this.pickText
							}}
						>
							<Icon @name="type" />
							Add text
						</button>
					</div>
					<div class="sub-empty-note">Drop an
						image, or paste one.</div>
				</div>
			</div>
		{{/unless}}
	</template>
}
