import { update } from './doc-store';
import type { Artboard, Layer } from './doc-model';
import { isGroup } from './layer-tree';

export function setArtboard(patch: Partial<Artboard>): void {
	update((doc) => ({
		...doc,
		artboard: { ...doc.artboard, ...patch },
		updatedAt: Date.now(),
	}));
}

const anchorOf = (c: number, span: number): number =>
	c < span / 4 ? 0 : c > (3 * span) / 4 ? 1 : 0.5;

export function resizeArtboardReflow(
	patch: Partial<Artboard> & { width: number; height: number },
): void {
	update((doc) => {
		const { width: W, height: H } = doc.artboard;
		const { width: W2, height: H2 } = patch;
		const s = Math.min(W2 / W, H2 / H);
		const reflow = (layers: Layer[]): Layer[] =>
			layers.map((l) => {
				if (isGroup(l))
					return {
						...l,
						children: reflow(l.children),
					};
				const t = l.transform;
				const ax = anchorOf(t.x, W);
				const ay = anchorOf(t.y, H);
				return {
					...l,
					transform: {
						...t,
						x: ax * W2 + (t.x - ax * W) * s,
						y: ay * H2 + (t.y - ay * H) * s,
						scaleX: t.scaleX * s,
						scaleY: t.scaleY * s,
					},
				};
			});
		return {
			...doc,
			artboard: { ...doc.artboard, ...patch },
			layers: reflow(doc.layers),
			guides: doc.guides.map((g) => ({
				...g,
				pos: g.pos * (g.axis === 'x' ? W2 / W : H2 / H),
			})),
			updatedAt: Date.now(),
		};
	});
}
