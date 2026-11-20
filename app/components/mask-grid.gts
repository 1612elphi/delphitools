import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import {
	MASK_COLUMNS,
	MASK_SHAPES,
	type MaskShape,
} from 'delphitools-v2/lib/mask-shapes';
import './mask-grid.css';

const GRID_STYLE = htmlSafe(
	`grid-template-columns: repeat(${MASK_COLUMNS}, var(--mask-cell, 4rem))`,
);

const dragScroll = modifier((el: HTMLElement) => {
	let last: { x: number; y: number; t: number } | null = null;
	let vx = 0;
	let vy = 0;
	let moved = false;
	let frame = 0;

	const glide = (prev: number) => (now: number) => {
		const dt = now - prev;
		el.scrollLeft -= vx * dt;
		el.scrollTop -= vy * dt;
		const decay = 0.94 ** (dt / 16);
		vx *= decay;
		vy *= decay;
		if (Math.abs(vx) + Math.abs(vy) > 0.02)
			frame = requestAnimationFrame(glide(now));
	};
	const move = (event: PointerEvent) => {
		if (!last) return;
		const dx = event.clientX - last.x;
		const dy = event.clientY - last.y;
		const dt = Math.max(1, event.timeStamp - last.t);
		if (Math.abs(dx) + Math.abs(dy) > 3) {
			moved = true;
			el.classList.add('is-dragging');
		}
		el.scrollLeft -= dx;
		el.scrollTop -= dy;
		vx = 0.7 * vx + 0.3 * (dx / dt);
		vy = 0.7 * vy + 0.3 * (dy / dt);
		last = {
			x: event.clientX,
			y: event.clientY,
			t: event.timeStamp,
		};
	};
	const up = () => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		if (!last) return;
		last = null;
		el.classList.remove('is-dragging');
		setTimeout(() => (moved = false), 0);
		frame = requestAnimationFrame(glide(performance.now()));
	};
	const down = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse' || event.button !== 0) return;
		cancelAnimationFrame(frame);
		last = {
			x: event.clientX,
			y: event.clientY,
			t: event.timeStamp,
		};
		vx = 0;
		vy = 0;
		moved = false;
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	};
	const click = (event: MouseEvent) => {
		if (!moved) return;
		event.stopPropagation();
		event.preventDefault();
	};

	el.addEventListener('pointerdown', down);
	el.addEventListener('click', click, true);
	return () => {
		up();
		cancelAnimationFrame(frame);
		el.removeEventListener('pointerdown', down);
		el.removeEventListener('click', click, true);
	};
});

interface Signature {
	Element: HTMLDivElement;
	Args: {
		selected: string | null | undefined;
		onSelect: (shape: MaskShape) => void;
	};
}

const MaskGrid: TOC<Signature> = <template>
	<div
		class="dt-masker-grid"
		style={{GRID_STYLE}}
		{{dragScroll}}
		...attributes
	>
		{{#each MASK_SHAPES key="id" as |shape|}}
			<button
				type="button"
				class="dt-masker-cell
					{{if
						(eq shape.d @selected)
						'is-active'
					}}"
				title={{shape.label}}
				aria-label={{shape.label}}
				{{on "click" (fn @onSelect shape)}}
			>
				<svg
					viewBox="0 0 100 100"
					aria-hidden="true"
				><path d={{shape.d}} /></svg>
			</button>
		{{/each}}
	</div>
</template>;

export default MaskGrid;
