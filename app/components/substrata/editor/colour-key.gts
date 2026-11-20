import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import {
	getColour,
	subscribeColour,
} from 'delphitools-v2/lib/substrata/colour-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class ColourKey extends Component<{
	Args: { phone?: boolean };
}> {
	colour = new TrackedExternal(subscribeColour, getColour);

	willDestroy() {
		super.willDestroy();
		this.colour.unsubscribe();
	}

	get dotStyle() {
		const c = this.colour.current;
		return htmlSafe(
			`--sub-key-colour: rgb(${c.rgb.r} ${c.rgb.g} ${c.rgb.b} / ${c.alpha})`,
		);
	}

	get open() {
		return this.args.phone
			? editorUi.isOpen('colour')
			: editorUi.ringOpen;
	}

	toggle = () => {
		if (this.args.phone) editorUi.toggle('colour', true);
		else if (editorUi.ringOpen) editorUi.closeRing();
		else editorUi.ringOpen = true;
	};

	<template>
		<div class="sub-cells sub-ed-colour-key">
			<button
				type="button"
				class="canon-button canon-button--segment sub-cell
					{{if this.open 'is-open'}}"
				aria-label="Colour"
				aria-expanded={{if this.open "true" "false"}}
				title="Colour"
				{{on "click" this.toggle}}
			><span
					class="sub-ed-colour-dot"
					style={{this.dotStyle}}
				></span></button>
		</div>
	</template>
}
