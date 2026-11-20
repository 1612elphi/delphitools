import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import './backdrop.css';

const W = 240;
const H = 160;
const FONT = '"Open Sans Condensed"';
const NAME = `700 32px ${FONT}`;
const KIND = `600 11px ${FONT}`;

const tiles = new Map<string, Promise<string>>();

async function drawTile(name: string, kind: string): Promise<string> {
	await Promise.all([
		document.fonts.load(NAME),
		document.fonts.load(KIND),
	]);
	const scale = 2;
	const canvas = document.createElement('canvas');
	canvas.width = W * scale;
	canvas.height = H * scale;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(scale, scale);
	ctx.textAlign = 'center';
	for (const [x, y] of [
		[W / 4, H / 4],
		[(3 * W) / 4, (3 * H) / 4],
	] as const) {
		ctx.font = NAME;
		ctx.letterSpacing = '0px';
		ctx.fillText(name, x, y + 4);
		ctx.font = KIND;
		ctx.letterSpacing = '2px';
		ctx.fillText(kind, x + 1, y + 20);
	}
	return canvas.toDataURL();
}

const paint = modifier(
	(element: HTMLElement, [name, kind]: [string, string]) => {
		let live = true;
		const key = `${name}\n${kind}`;
		let tile = tiles.get(key);
		if (!tile) {
			tile = drawTile(name, kind);
			tiles.set(key, tile);
		}
		void tile.then((url) => {
			if (!live) return;
			element.style.setProperty('--err-tile', `url(${url})`);
			element.classList.add('is-ready');
		});
		return () => {
			live = false;
		};
	},
);

const Backdrop: TOC<{
	Element: HTMLDivElement;
	Args: { name: string; kind: string };
}> = <template>
	<div
		class="err-backdrop"
		aria-hidden="true"
		...attributes
		{{paint @name @kind}}
	></div>
</template>;

export default Backdrop;
