import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import type { Swatch } from 'delphitools-v2/lib/substrata/colour-ring/geometry';

const SHOWN = 1500;

class CaptionState {
	@tracked swatch: Swatch | null = null;
	@tracked visible = false;
	#timer: ReturnType<typeof setTimeout> | undefined;

	show = (swatch: Swatch): void => {
		this.swatch = swatch;
		this.visible = true;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.visible = false;
		}, SHOWN);
	};
}

export const caption = new CaptionState();

export default class ColourCaption extends Component<{
	Args: { phone: boolean };
}> {
	get swatch() {
		return caption.swatch;
	}

	get head() {
		const s = caption.swatch;
		if (!s) return '';
		return s.name ? `${s.code}  ${s.name}` : s.hex;
	}

	get sampleStyle() {
		return htmlSafe(
			`background: ${caption.swatch?.hex ?? 'transparent'}`,
		);
	}

	get place() {
		if (this.args.phone) return 'is-phone';
		return editorUi.ringOpen ? 'is-ring' : 'is-key';
	}

	<template>
		<div
			class="sub-caption
				{{this.place}}
				{{if caption.visible 'is-visible'}}"
			role="status"
		>
			{{#if this.swatch}}
				<span
					class="sub-caption-sample"
					style={{this.sampleStyle}}
				></span>
				<span class="sub-caption-lines">
					<span
						class="sub-caption-head"
					>{{this.head}}</span>
					{{#if this.swatch.name}}
						<span
							class="sub-caption-hex"
						>{{this.swatch.hex}}</span>
					{{/if}}
				</span>
			{{/if}}
		</div>
	</template>
}
