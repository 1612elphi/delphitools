import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { getSnapshot } from 'delphitools-v2/lib/substrata/doc-store';
import { renderForExport } from 'delphitools-v2/lib/substrata/export-source';

export function renderThumbnail(side = 240): HTMLCanvasElement | null {
	const doc = getSnapshot();
	if (!doc) return null;
	const { width, height } = doc.artboard;
	return renderForExport({
		scale: Math.min(1, side / Math.max(width, height)),
	});
}

// ponytail: still pictures; iOS plays a fan and a page turn before the action
export default class ThumbnailArt extends Component<{
	Args: { kind: 'fan' | 'pages' };
}> {
	@tracked src: string | null = null;

	get aspect() {
		const ab = getSnapshot()?.artboard;
		return htmlSafe(
			`--sub-pg-aspect: ${ab ? ab.width / ab.height : 0.8}`,
		);
	}

	draw = modifier(() => {
		if (this.args.kind !== 'fan') return;
		const frame = requestAnimationFrame(() => {
			this.src = renderThumbnail()?.toDataURL() ?? null;
		});
		return () => cancelAnimationFrame(frame);
	});

	<template>
		<span
			class="sub-pg-art is-{{@kind}}"
			style={{this.aspect}}
			{{this.draw}}
		>
			{{#if this.src}}
				<img
					class="sub-pg-art-card"
					src={{this.src}}
					alt=""
				/>
			{{else}}
				<span class="sub-pg-art-card is-under"></span>
				<span class="sub-pg-art-card"></span>
			{{/if}}
		</span>
	</template>
}
