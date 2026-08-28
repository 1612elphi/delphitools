import {
	hexToRgb,
	rgbToHex,
	rgbToOklab,
	oklabToRgb,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';

export type GradientMode = 'linear' | 'corners' | 'mesh';
export type GridSize = 2 | 3;

export interface ColourStop {
	id: string;
	colour: string;
	/** percent: 0 to 100 */
	position: number;
}

export interface CornerColours {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
}

export type CornerKey = keyof CornerColours;

export interface MeshPoint {
	id: string;
	/** normalized: 0 to 1 */
	x: number;
	y: number;
	colour: string;
}

export interface GradientState {
	mode: GradientMode;
	angle: number;
	/** percent canvas noise */
	noise: number;
	stops: readonly ColourStop[];
	corners: CornerColours;
	points: readonly MeshPoint[];
}

export const CORNER_KEYS: CornerKey[] = [
	'topLeft',
	'topRight',
	'bottomLeft',
	'bottomRight',
];

export const MIN_STOPS = 2;

export function newId(): string {
	return Math.random().toString(36).substring(2, 9);
}

export function randomHex(): string {
	return `#${Math.floor(Math.random() * 16777215)
		.toString(16)
		.padStart(6, '0')}`;
}

export function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

export function normaliseHex(value: string): string | null {
	const rgb = hexToRgb(value.trim());
	return rgb ? rgbToHex(...rgb) : null;
}

export function sortStops(stops: readonly ColourStop[]): ColourStop[] {
	return [...stops].sort((a, b) => a.position - b.position);
}

function lerpTriple(a: Triple, b: Triple, t: number): Triple {
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	];
}

/** avoids grey midpoints */
export function lerpOklab(hex1: string, hex2: string, t: number): string {
	const rgb1 = hexToRgb(hex1);
	const rgb2 = hexToRgb(hex2);
	if (!rgb1 || !rgb2) return hex1;

	const lab1 = rgbToOklab(...rgb1);
	const lab2 = rgbToOklab(...rgb2);
	return rgbToHex(...oklabToRgb(...lerpTriple(lab1, lab2, t)));
}

const MESH_COLOURS_2 = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];
const MESH_COLOURS_3 = [
	'#3b82f6',
	'#8b5cf6',
	'#ec4899',
	'#10b981',
	'#6366f1',
	'#f59e0b',
	'#06b6d4',
	'#84cc16',
	'#ef4444',
];

export function initialMeshPoints(gridSize: GridSize): MeshPoint[] {
	const colours = gridSize === 2 ? MESH_COLOURS_2 : MESH_COLOURS_3;
	const points: MeshPoint[] = [];
	let idx = 0;

	for (let y = 0; y < gridSize; y++) {
		for (let x = 0; x < gridSize; x++) {
			points.push({
				id: newId(),
				x: x / (gridSize - 1),
				y: y / (gridSize - 1),
				colour: colours[idx % colours.length]!,
			});
			idx++;
		}
	}
	return points;
}

export function stopForWidestGap(stops: readonly ColourStop[]): ColourStop {
	const sorted = sortStops(stops);
	let maxGap = 0;
	let insertPosition = 50;

	for (let i = 0; i < sorted.length - 1; i++) {
		const gap = sorted[i + 1]!.position - sorted[i]!.position;
		if (gap > maxGap) {
			maxGap = gap;
			insertPosition = sorted[i]!.position + gap / 2;
		}
	}

	return {
		id: newId(),
		colour: randomHex(),
		position: Math.round(insertPosition),
	};
}

export function pigmentBlend(
	stops: readonly ColourStop[],
	stepsPerGap = 3,
): ColourStop[] {
	const sorted = sortStops(stops);
	const blended: ColourStop[] = [];

	for (let i = 0; i < sorted.length; i++) {
		const current = sorted[i]!;
		blended.push(current);

		const next = sorted[i + 1];
		if (!next) continue;

		const posGap = next.position - current.position;
		for (let step = 1; step <= stepsPerGap; step++) {
			const t = step / (stepsPerGap + 1);
			blended.push({
				id: newId(),
				colour: lerpOklab(
					current.colour,
					next.colour,
					t,
				),
				position: Math.round(
					current.position + posGap * t,
				),
			});
		}
	}

	return blended;
}

export function gradientCss(
	state: GradientState,
	fmt: (hex: string) => string,
): string {
	switch (state.mode) {
		case 'linear': {
			const stops = sortStops(state.stops)
				.map(
					(stop) =>
						`${fmt(stop.colour)} ${stop.position}%`,
				)
				.join(', ');
			return `linear-gradient(${state.angle}deg, ${stops})`;
		}
		case 'corners': {
			const c = state.corners;
			return `background:
  radial-gradient(ellipse at top left, ${fmt(c.topLeft)}, transparent 70%),
  radial-gradient(ellipse at top right, ${fmt(c.topRight)}, transparent 70%),
  radial-gradient(ellipse at bottom left, ${fmt(c.bottomLeft)}, transparent 70%),
  radial-gradient(ellipse at bottom right, ${fmt(c.bottomRight)}, transparent 70%);`;
		}
		case 'mesh': {
			const layers = state.points
				.map(
					(p) =>
						`radial-gradient(circle at ${Math.round(p.x * 100)}% ${Math.round(p.y * 100)}%, ${fmt(p.colour)}, transparent 60%)`,
				)
				.join(',\n  ');
			return `/* Mesh gradients cannot be perfectly replicated in CSS.
   Use image export for accurate results.
   Below is a rough approximation: */
background: ${layers};`;
		}
	}
}

function renderLinear(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	angle: number,
	stops: readonly ColourStop[],
): void {
	// css zero points up
	const angleRad = ((angle - 90) * Math.PI) / 180;
	const diagonal = Math.hypot(width, height);

	const gradient = ctx.createLinearGradient(
		width / 2 - (Math.cos(angleRad) * diagonal) / 2,
		height / 2 - (Math.sin(angleRad) * diagonal) / 2,
		width / 2 + (Math.cos(angleRad) * diagonal) / 2,
		height / 2 + (Math.sin(angleRad) * diagonal) / 2,
	);
	// clamp canvas stop positions
	for (const stop of sortStops(stops)) {
		gradient.addColorStop(
			clamp(stop.position / 100, 0, 1),
			stop.colour,
		);
	}

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
}

function renderCorners(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	corners: CornerColours,
): void {
	const tl = hexToRgb(corners.topLeft);
	const tr = hexToRgb(corners.topRight);
	const bl = hexToRgb(corners.bottomLeft);
	const br = hexToRgb(corners.bottomRight);
	if (!tl || !tr || !bl || !br) return;

	const imageData = ctx.createImageData(width, height);
	const data = imageData.data;

	for (let y = 0; y < height; y++) {
		const v = y / (height - 1);
		for (let x = 0; x < width; x++) {
			const u = x / (width - 1);
			const top = lerpTriple(tl, tr, u);
			const bottom = lerpTriple(bl, br, u);
			const pixel = lerpTriple(top, bottom, v);

			const idx = (y * width + x) * 4;
			data[idx] = Math.round(pixel[0]);
			data[idx + 1] = Math.round(pixel[1]);
			data[idx + 2] = Math.round(pixel[2]);
			data[idx + 3] = 255;
		}
	}
	ctx.putImageData(imageData, 0, 0);
}

// prevent zero-distance division
function renderMesh(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	points: readonly MeshPoint[],
): void {
	const weighted = points
		.map((p) => ({ x: p.x, y: p.y, rgb: hexToRgb(p.colour) }))
		.filter(
			(p): p is { x: number; y: number; rgb: Triple } =>
				!!p.rgb,
		);
	if (weighted.length === 0) return;

	const imageData = ctx.createImageData(width, height);
	const data = imageData.data;

	for (let y = 0; y < height; y++) {
		const v = y / (height - 1);
		for (let x = 0; x < width; x++) {
			const u = x / (width - 1);

			let totalWeight = 0;
			let r = 0;
			let g = 0;
			let b = 0;

			for (const point of weighted) {
				const dx = u - point.x;
				const dy = v - point.y;
				const weight = 1 / (dx * dx + dy * dy + 0.01);
				totalWeight += weight;
				r += point.rgb[0] * weight;
				g += point.rgb[1] * weight;
				b += point.rgb[2] * weight;
			}

			const idx = (y * width + x) * 4;
			data[idx] = Math.round(r / totalWeight);
			data[idx + 1] = Math.round(g / totalWeight);
			data[idx + 2] = Math.round(b / totalWeight);
			data[idx + 3] = 255;
		}
	}
	ctx.putImageData(imageData, 0, 0);
}

function applyNoise(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	noise: number,
): void {
	if (noise === 0) return;

	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;
	const intensity = noise / 100;

	for (let i = 0; i < data.length; i += 4) {
		const grain = (Math.random() - 0.5) * 2 * intensity * 50;
		data[i] = clamp(data[i]! + grain, 0, 255);
		data[i + 1] = clamp(data[i + 1]! + grain, 0, 255);
		data[i + 2] = clamp(data[i + 2]! + grain, 0, 255);
	}

	ctx.putImageData(imageData, 0, 0);
}

export function renderGradient(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	state: GradientState,
): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	canvas.width = width;
	canvas.height = height;

	switch (state.mode) {
		case 'linear':
			renderLinear(
				ctx,
				width,
				height,
				state.angle,
				state.stops,
			);
			break;
		case 'corners':
			renderCorners(ctx, width, height, state.corners);
			break;
		case 'mesh':
			renderMesh(ctx, width, height, state.points);
			break;
	}

	applyNoise(ctx, width, height, state.noise);
}
