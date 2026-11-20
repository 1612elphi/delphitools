import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import './pages.css';

const COLUMN = 300;
const COLUMN_GAP = 1;

function flowColumns(block: HTMLElement): number {
	const room = block.clientHeight;
	let columns = 1;
	let used = 0;
	for (const row of block.children) {
		const tall = (row as HTMLElement).offsetHeight;
		if (used > 0 && used + 1 + tall > room) {
			columns += 1;
			used = tall;
		} else used += (used ? 1 : 0) + tall;
	}
	return columns;
}

export const flow = modifier(
	(scroller: HTMLElement, [onLay]: [((el: HTMLElement) => void)?]) => {
		const lay = () => {
			const width = Math.min(
				COLUMN,
				scroller.clientWidth - 32,
			);
			scroller.style.setProperty(
				'--sub-pg-column',
				`${width}px`,
			);
			for (const block of scroller.querySelectorAll<HTMLElement>(
				'.sub-pg-block',
			)) {
				block.style.inlineSize = `${width}px`;
				const n = flowColumns(block);
				block.style.inlineSize = `${n * width + (n - 1) * COLUMN_GAP}px`;
			}
			onLay?.(scroller);
		};
		const wheel = (e: WheelEvent) => {
			if (
				e.ctrlKey ||
				Math.abs(e.deltaX) >= Math.abs(e.deltaY)
			)
				return;
			e.preventDefault();
			scroller.scrollLeft +=
				e.deltaMode === WheelEvent.DOM_DELTA_LINE
					? e.deltaY * 16
					: e.deltaY;
		};
		scroller.addEventListener('wheel', wheel, { passive: false });
		const ro = new ResizeObserver(lay);
		ro.observe(scroller);
		const mo = new MutationObserver(lay);
		mo.observe(scroller, { childList: true, subtree: true });
		return () => {
			scroller.removeEventListener('wheel', wheel);
			ro.disconnect();
			mo.disconnect();
		};
	},
);

export const Rule: TOC<{ Args: { icon: string } }> = <template>
	<div class="sub-pg-rule" aria-hidden="true">
		<IconSvg @name={{@icon}} />
		<span class="sub-pg-rule-line"></span>
	</div>
</template>;

export const ActionTile: TOC<{
	Args: { title: string; disabled?: boolean; onClick: () => void };
	Blocks: { default: [] };
	Element: HTMLButtonElement;
}> = <template>
	<button
		type="button"
		class="sub-pg-tile"
		disabled={{@disabled}}
		...attributes
		{{on "click" @onClick}}
	>
		<span
			class="sub-pg-tile-art"
			aria-hidden="true"
		>{{yield}}</span>
		<span class="sub-pg-tile-title">{{@title}}</span>
	</button>
</template>;
