import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { TrackedArray } from 'tracked-built-ins';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { contrastText } from 'delphitools-v2/lib/colour-maths';
import {
	CORNER_KEYS,
	MIN_STOPS,
	clamp,
	gradientCss,
	initialMeshPoints,
	newId,
	normaliseHex,
	pigmentBlend,
	renderGradient,
	sortStops,
	stopForWidestGap,
	type ColourStop,
	type CornerColours,
	type CornerKey,
	type GradientMode,
	type GradientState,
	type GridSize,
	type MeshPoint,
} from 'delphitools-v2/lib/gradient';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

const PREVIEW_WIDTH = 400;
const PREVIEW_HEIGHT = 300;
const COPIED_MS = 1500;

const MIN_EXPORT = 100;
const MAX_EXPORT = 8192;

// Dots are inset from the canvas edge so a corner tooltip stays on screen. The
// mesh mapping is the same inset run backwards, so a dot dragged to the far
// left still means x = 0.
const MESH_INSET_X = 12;
const MESH_SPAN_X = 76;
const MESH_INSET_Y = 15;
const MESH_SPAN_Y = 70;

/** Pixels of movement before a press counts as a drag rather than a click. */
const DRAG_SLOP = 4;

const MODES: { key: GradientMode; label: string }[] = [
	{ key: 'linear', label: 'Linear' },
	{ key: 'corners', label: 'Corners' },
	{ key: 'mesh', label: 'Mesh' },
];

const CORNER_POSITIONS: { key: CornerKey; x: string; y: string }[] = [
	{ key: 'topLeft', x: '12%', y: '15%' },
	{ key: 'topRight', x: '88%', y: '15%' },
	{ key: 'bottomLeft', x: '12%', y: '85%' },
	{ key: 'bottomRight', x: '88%', y: '85%' },
];

const CORNER_LABELS: Record<CornerKey, string> = {
	topLeft: 'Top Left',
	topRight: 'Top Right',
	bottomLeft: 'Bottom Left',
	bottomRight: 'Bottom Right',
};

const ANGLE_PRESETS = [0, 45, 90, 135, 180, 225, 270, 315];

const SIZE_PRESETS: { label: string; w: number; h: number }[] = [
	{ label: '512', w: 512, h: 512 },
	{ label: '1K', w: 1024, h: 1024 },
	{ label: '2K', w: 2048, h: 2048 },
	{ label: '4K', w: 4096, h: 4096 },
	{ label: 'HD', w: 1920, h: 1080 },
	{ label: '4K HD', w: 3840, h: 2160 },
	{ label: 'Insta', w: 1080, h: 1080 },
	{ label: 'Story', w: 1080, h: 1920 },
];

export default class GradientGennyTool extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked mode: GradientMode = 'linear';
	@tracked angle = 90;
	@tracked noise = 0;
	@tracked exportWidth = 800;
	@tracked exportHeight = 600;
	@tracked copied: string | null = null;
	@tracked hoveredCorner: CornerKey | null = null;
	@tracked hoveredPoint: string | null = null;
	@tracked draggingPoint: string | null = null;
	@tracked gridSize: GridSize = 2;

	@tracked corners: CornerColours = {
		topLeft: '#3b82f6',
		topRight: '#8b5cf6',
		bottomLeft: '#10b981',
		bottomRight: '#f59e0b',
	};

	stops: TrackedArray<ColourStop> = new TrackedArray([
		{ id: newId(), colour: '#3b82f6', position: 0 },
		{ id: newId(), colour: '#8b5cf6', position: 100 },
	]);

	points: TrackedArray<MeshPoint> = new TrackedArray(
		initialMeshPoints(2),
	);

	#copiedTimer?: ReturnType<typeof setTimeout>;

	// Pointer-drag bookkeeping for the mesh dots. None of it is rendered, so
	// none of it is tracked; `draggingPoint` above carries the visible part.
	#dragId: string | null = null;
	#dragField: DOMRect | null = null;
	#dragOrigin = { px: 0, py: 0, x: 0, y: 0 };
	#dragMoved = false;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get state(): GradientState {
		return {
			mode: this.mode,
			angle: this.angle,
			noise: this.noise,
			stops: this.stops,
			corners: this.corners,
			points: this.points,
		};
	}

	get isLinear() {
		return this.mode === 'linear';
	}

	get isCorners() {
		return this.mode === 'corners';
	}

	get isMesh() {
		return this.mode === 'mesh';
	}

	get modes() {
		return MODES.map((entry) => ({
			...entry,
			isActive: entry.key === this.mode,
		}));
	}

	get cssText() {
		return gradientCss(this.state, this.colourNotation.format);
	}

	get atMinStops() {
		return this.stops.length <= MIN_STOPS;
	}

	get dialStyle() {
		return htmlSafe(
			`transform: translate(-50%, -100%) rotate(${this.angle}deg)`,
		);
	}

	get anglePresets() {
		return ANGLE_PRESETS.map((preset) => ({
			preset,
			label: `${preset}°`,
			isActive: this.angle === preset,
		}));
	}

	get sizePresets() {
		return SIZE_PRESETS.map((preset) => ({
			...preset,
			isActive:
				this.exportWidth === preset.w &&
				this.exportHeight === preset.h,
		}));
	}

	get stopRows() {
		return this.stops.map((stop) => ({
			...stop,
			fillStyle: htmlSafe(`background-color: ${stop.colour}`),
		}));
	}

	/** The four dots drawn over the preview in corners mode. */
	get cornerDots() {
		return CORNER_POSITIONS.map((position) => {
			const colour = this.corners[position.key];
			return {
				key: position.key,
				colour,
				name: getColourName(colour),
				value: this.colourNotation.format(colour),
				isHovered: this.hoveredCorner === position.key,
				seatStyle: htmlSafe(
					`left: ${position.x}; top: ${position.y}`,
				),
				faceStyle: this.#dotStyle(colour),
				tipStyle: this.#tipStyle(colour),
			};
		});
	}

	/** The same four colours as an editable list under the preview. */
	get cornerRows() {
		return CORNER_KEYS.map((key, index) => {
			const colour = this.corners[key];
			return {
				key,
				colour,
				label: CORNER_LABELS[key],
				name: getColourName(colour),
				index,
				isHovered: this.hoveredCorner === key,
				fillStyle: htmlSafe(
					`background-color: ${colour}`,
				),
			};
		});
	}

	get meshDots() {
		return this.points.map((point, index) => ({
			id: point.id,
			colour: point.colour,
			number: index + 1,
			name: getColourName(point.colour),
			value: this.colourNotation.format(point.colour),
			isHovered: this.hoveredPoint === point.id,
			isDragging: this.draggingPoint === point.id,
			seatStyle: htmlSafe(
				`left: ${(MESH_INSET_X + point.x * MESH_SPAN_X).toFixed(2)}%; top: ${(MESH_INSET_Y + point.y * MESH_SPAN_Y).toFixed(2)}%`,
			),
			faceStyle: this.#dotStyle(point.colour),
			tipStyle: this.#tipStyle(point.colour),
		}));
	}

	get meshRows() {
		return this.points.map((point, index) => ({
			id: point.id,
			colour: point.colour,
			number: index + 1,
			name: getColourName(point.colour),
			value: this.colourNotation.format(point.colour),
			position: `(${Math.round(point.x * 100)}%, ${Math.round(point.y * 100)}%)`,
			isHovered: this.hoveredPoint === point.id,
			fillStyle: htmlSafe(
				`background-color: ${point.colour}`,
			),
			badgeStyle: htmlSafe(
				`background-color: ${point.colour}; color: ${contrastText(point.colour)}`,
			),
		}));
	}

	// Every hex reaching a style attribute has been through normaliseHex, so the
	// `40` suffix below is always a valid 8-digit colour rather than a splice
	// into whatever the user typed.
	#dotStyle(colour: string) {
		return htmlSafe(
			`background-color: ${colour}; --dt-gradient-ring: ${colour}40`,
		);
	}

	#tipStyle(colour: string) {
		return htmlSafe(
			`background-color: ${colour}; color: ${contrastText(colour)}`,
		);
	}

	/**
	 * Repaints whenever anything the renderer reads changes — the modifier body
	 * consumes the same tracked state, so no dependency list is needed.
	 */
	paint = modifier((element: HTMLCanvasElement) => {
		renderGradient(
			element,
			PREVIEW_WIDTH,
			PREVIEW_HEIGHT,
			this.state,
		);
	});

	setMode = (mode: GradientMode) => {
		this.mode = mode;
	};

	setAngle = (event: Event) => {
		this.angle = clamp(
			Number((event.target as HTMLInputElement).value),
			0,
			360,
		);
	};

	setAnglePreset = (angle: number) => {
		this.angle = angle;
	};

	/** Clicking the dial points the gradient at the click, 0° being up. */
	setAngleFromDial = (event: MouseEvent) => {
		const rect = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const x = event.clientX - rect.left - rect.width / 2;
		const y = event.clientY - rect.top - rect.height / 2;
		this.angle = Math.round(
			((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360,
		);
	};

	setNoise = (event: Event) => {
		this.noise = clamp(
			Number((event.target as HTMLInputElement).value),
			0,
			100,
		);
	};

	setExportWidth = (event: Event) => {
		this.exportWidth = Number(
			(event.target as HTMLInputElement).value,
		);
	};

	setExportHeight = (event: Event) => {
		this.exportHeight = Number(
			(event.target as HTMLInputElement).value,
		);
	};

	setSizePreset = (width: number, height: number) => {
		this.exportWidth = width;
		this.exportHeight = height;
	};

	addStop = () => {
		this.stops.push(stopForWidestGap(this.stops));
	};

	removeStop = (id: string) => {
		if (this.atMinStops) return;
		const index = this.stops.findIndex((stop) => stop.id === id);
		if (index !== -1) this.stops.splice(index, 1);
	};

	blendStops = () => {
		this.stops.splice(
			0,
			this.stops.length,
			...pigmentBlend(this.stops),
		);
	};

	setStopColour = (id: string, event: Event) => {
		const input = event.target as HTMLInputElement;
		const index = this.stops.findIndex((stop) => stop.id === id);
		const current = this.stops[index];
		if (!current) return;

		const hex = normaliseHex(input.value);
		// A rejected entry puts the stored value back rather than leaving the
		// field showing something the gradient does not use.
		if (!hex) {
			input.value = current.colour;
			return;
		}
		this.stops[index] = { ...current, colour: hex };
	};

	setStopPosition = (id: string, event: Event) => {
		const input = event.target as HTMLInputElement;
		const index = this.stops.findIndex((stop) => stop.id === id);
		const current = this.stops[index];
		if (!current) return;

		const value = Number(input.value);
		if (input.value.trim() === '' || !Number.isFinite(value)) {
			input.value = String(current.position);
			return;
		}

		this.stops[index] = {
			...current,
			position: Math.round(clamp(value, 0, 100)),
		};
		this.stops.splice(
			0,
			this.stops.length,
			...sortStops(this.stops),
		);
	};

	setCorner = (key: CornerKey, event: Event) => {
		const input = event.target as HTMLInputElement;
		const hex = normaliseHex(input.value);
		if (!hex) {
			input.value = this.corners[key];
			return;
		}
		this.corners = { ...this.corners, [key]: hex };
	};

	hoverCorner = (key: CornerKey) => {
		this.hoveredCorner = key;
	};

	clearCornerHover = () => {
		this.hoveredCorner = null;
	};

	setGridSize = (size: GridSize) => {
		this.gridSize = size;
		this.points.splice(
			0,
			this.points.length,
			...initialMeshPoints(size),
		);
	};

	setPointColour = (id: string, event: Event) => {
		const input = event.target as HTMLInputElement;
		const index = this.points.findIndex((point) => point.id === id);
		const current = this.points[index];
		if (!current) return;

		const hex = normaliseHex(input.value);
		if (!hex) {
			input.value = current.colour;
			return;
		}
		this.points[index] = { ...current, colour: hex };
	};

	hoverPoint = (id: string) => {
		this.hoveredPoint = id;
	};

	clearPointHover = () => {
		this.hoveredPoint = null;
	};

	// Free positional dragging, on pointer events rather than a drag library:
	// capture keeps the moves coming to the dot even when the pointer outruns it.
	startDrag = (id: string, event: PointerEvent) => {
		const dot = event.currentTarget as HTMLElement;
		const field = dot.closest('.dt-gradient-dots');
		const point = this.points.find((entry) => entry.id === id);
		if (!field || !point) return;

		this.#dragField = field.getBoundingClientRect();
		this.#dragId = id;
		this.#dragMoved = false;
		this.#dragOrigin = {
			px: event.clientX,
			py: event.clientY,
			x: point.x,
			y: point.y,
		};
		this.draggingPoint = id;
		dot.setPointerCapture(event.pointerId);
	};

	moveDrag = (event: PointerEvent) => {
		const rect = this.#dragField;
		const id = this.#dragId;
		if (!rect || !id) return;

		const dx = event.clientX - this.#dragOrigin.px;
		const dy = event.clientY - this.#dragOrigin.py;
		if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) {
			this.#dragMoved = true;
		}

		const index = this.points.findIndex((point) => point.id === id);
		const current = this.points[index];
		if (!current) return;

		this.points[index] = {
			...current,
			x: clamp(
				this.#dragOrigin.x +
					((dx / rect.width) * 100) / MESH_SPAN_X,
				0,
				1,
			),
			y: clamp(
				this.#dragOrigin.y +
					((dy / rect.height) * 100) /
						MESH_SPAN_Y,
				0,
				1,
			),
		};
	};

	endDrag = (event: PointerEvent) => {
		const dot = event.currentTarget as HTMLElement;
		if (dot.hasPointerCapture(event.pointerId)) {
			dot.releasePointerCapture(event.pointerId);
		}
		this.#dragId = null;
		this.#dragField = null;
		this.draggingPoint = null;
	};

	/** Without this, letting go after a drag also opens the colour picker. */
	blockDragClick = (event: Event) => {
		if (this.#dragMoved) event.preventDefault();
	};

	downloadImage = () => {
		const canvas = document.createElement('canvas');
		// The size fields take free-form numbers; an empty one reads as 0, and
		// createImageData(0, 0) throws.
		renderGradient(
			canvas,
			Math.round(
				clamp(this.exportWidth, MIN_EXPORT, MAX_EXPORT),
			),
			Math.round(
				clamp(
					this.exportHeight,
					MIN_EXPORT,
					MAX_EXPORT,
				),
			),
			this.state,
		);

		const link = document.createElement('a');
		link.download = `gradient-${this.mode}.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
	};

	copy = async (value: string, label: string) => {
		await navigator.clipboard.writeText(value);
		this.copied = label;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copyCss = () => void this.copy(this.cssText, 'css');

	<template>
		<div class="dt-gradient">
			<div class="segmented dt-gradient-modes">
				{{#each this.modes key="key" as |option|}}
					<button
						type="button"
						class="dt-gradient-mode
							{{if
								option.isActive
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setMode
								option.key
							)
						}}
					>{{option.label}}</button>
				{{/each}}
			</div>

			<div class="dt-gradient-frame">
				<div class="dt-gradient-preview">
					<canvas
						class="dt-gradient-canvas"
						{{this.paint}}
					></canvas>

					{{#if this.isCorners}}
						<div class="dt-gradient-dots">
							{{#each
								this.cornerDots
								key="key"
								as |dot|
							}}
								<span
									class="dt-gradient-dot
										{{if
											dot.isHovered
											'is-hovered'
										}}"
									style={{dot.seatStyle}}
									{{on
										"mouseenter"
										(fn
											this.hoverCorner
											dot.key
										)
									}}
									{{on
										"mouseleave"
										this.clearCornerHover
									}}
								>
									<span
										class="dt-gradient-tip"
										style={{dot.tipStyle}}
									>
										<span
											class="dt-gradient-tip-name"
										>{{dot.name}}</span>
										<span
											class="dt-gradient-tip-value"
										>{{dot.value}}</span>
									</span>
									<span
										class="dt-gradient-dot-face"
										style={{dot.faceStyle}}
									></span>
									<input
										type="color"
										value={{dot.colour}}
										aria-label="Edit
											{{dot.name}}"
										{{on
											"input"
											(fn
												this.setCorner
												dot.key
											)
										}}
									/>
								</span>
							{{/each}}
						</div>

						{{! wording carried over from the Next app }}
						<p
							class="dt-gradient-preview-hint"
						>Click dots to change colours</p>
					{{/if}}

					{{#if this.isMesh}}
						<div class="dt-gradient-dots">
							{{! pointerdown starts a drag here rather than standing in for a click, which is what the rule guards against }}
							{{! template-lint-disable no-pointer-down-event-binding }}
							{{#each
								this.meshDots
								key="id"
								as |dot|
							}}
								<span
									class="dt-gradient-dot is-mesh
										{{if
											dot.isHovered
											'is-hovered'
										}}
										{{if
											dot.isDragging
											'is-dragging'
										}}"
									style={{dot.seatStyle}}
									{{on
										"mouseenter"
										(fn
											this.hoverPoint
											dot.id
										)
									}}
									{{on
										"mouseleave"
										this.clearPointHover
									}}
									{{on
										"pointerdown"
										(fn
											this.startDrag
											dot.id
										)
									}}
									{{on
										"pointermove"
										this.moveDrag
									}}
									{{on
										"pointerup"
										this.endDrag
									}}
									{{on
										"pointercancel"
										this.endDrag
									}}
								>
									<span
										class="dt-gradient-tip"
										style={{dot.tipStyle}}
									>
										<span
											class="dt-gradient-tip-name"
										>{{dot.name}}</span>
										<span
											class="dt-gradient-tip-value"
										>{{dot.value}}</span>
									</span>
									<span
										class="dt-gradient-dot-face"
										style={{dot.faceStyle}}
									>{{dot.number}}</span>
									<input
										type="color"
										value={{dot.colour}}
										aria-label="Edit
											{{dot.name}}"
										{{on
											"input"
											(fn
												this.setPointColour
												dot.id
											)
										}}
										{{on
											"click"
											this.blockDragClick
										}}
									/>
								</span>
							{{/each}}
						</div>

						{{! wording carried over from the Next app }}
						<p
							class="dt-gradient-preview-hint"
						>Drag dots to reposition, click
							to change colour</p>
					{{/if}}
				</div>

				{{#if this.isLinear}}
					<section class="dt-gradient-block">
						<div
							class="dt-gradient-block-head"
						>
							<span
								class="dt-gradient-label"
							>Colour Stops</span>
							<span
								class="dt-gradient-block-actions"
							>
								{{! wording carried over from the Next app }}
								<button
									type="button"
									class="dt-gradient-btn is-primary"
									title="Add intermediate colours using OKLab blending for vibrant, paint-like transitions"
									{{on
										"click"
										this.blendStops
									}}
								>
									<Icon
										@name="blend"
									/>
									Pigment
									Blend
								</button>
								<button
									type="button"
									class="dt-gradient-btn"
									{{on
										"click"
										this.addStop
									}}
								>
									<Icon
										@name="plus"
									/>
									Add Stop
								</button>
							</span>
						</div>

						<div class="dt-gradient-rows">
							{{#each
								this.stopRows
								key="id"
								as |row|
							}}
								<div
									class="dt-gradient-row"
								>
									<span
										class="dt-gradient-row-swatch"
									>
										<span
											style={{row.fillStyle}}
											aria-hidden="true"
										></span>
										<input
											type="color"
											value={{row.colour}}
											aria-label="Stop colour"
											{{on
												"input"
												(fn
													this.setStopColour
													row.id
												)
											}}
										/>
									</span>
									<input
										type="text"
										class="dt-gradient-row-hex"
										value={{row.colour}}
										aria-label="Stop colour"
										{{on
											"change"
											(fn
												this.setStopColour
												row.id
											)
										}}
									/>
									<span
										class="dt-gradient-row-pos"
									>
										<input
											type="number"
											min="0"
											max="100"
											value={{row.position}}
											aria-label="Stop position"
											{{on
												"change"
												(fn
													this.setStopPosition
													row.id
												)
											}}
										/>
										<span
										>%</span>
									</span>
									<button
										type="button"
										class="dt-gradient-row-remove"
										aria-label="Remove stop"
										disabled={{this.atMinStops}}
										{{on
											"click"
											(fn
												this.removeStop
												row.id
											)
										}}
									>
										<Icon
											@name="trash-2"
										/>
									</button>
								</div>
							{{/each}}
						</div>
					</section>

					<section class="dt-gradient-block">
						<div
							class="dt-gradient-block-head"
						>
							<span
								class="dt-gradient-label"
							>Angle</span>
							<span
								class="dt-gradient-number"
							>
								<input
									type="number"
									min="0"
									max="360"
									value={{this.angle}}
									aria-label="Angle"
									{{on
										"input"
										this.setAngle
									}}
								/>
								<span>deg</span>
							</span>
						</div>

						<div class="dt-gradient-angle">
							<button
								type="button"
								class="dt-gradient-dial"
								aria-label="Set angle"
								{{on
									"click"
									this.setAngleFromDial
								}}
							>
								<span
									class="dt-gradient-dial-needle"
									style={{this.dialStyle}}
								></span>
								<span
									class="dt-gradient-dial-hub"
								></span>
							</button>
							<input
								type="range"
								class="dt-gradient-slider"
								min="0"
								max="360"
								step="1"
								value={{this.angle}}
								aria-label="Angle"
								{{on
									"input"
									this.setAngle
								}}
							/>
						</div>

						<div
							class="segmented dt-gradient-presets is-angles"
						>
							{{#each
								this.anglePresets
								key="preset"
								as |option|
							}}
								<button
									type="button"
									class="dt-gradient-preset
										{{if
											option.isActive
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setAnglePreset
											option.preset
										)
									}}
								>{{option.label}}</button>
							{{/each}}
						</div>
					</section>
				{{/if}}

				{{#if this.isCorners}}
					<section class="dt-gradient-block">
						<span
							class="dt-gradient-label"
						>Corner Colours</span>
						<div
							class="dt-gradient-corners"
						>
							{{#each
								this.cornerRows
								key="key"
								as |row|
							}}
								<div
									class="dt-gradient-corner
										{{if
											row.isHovered
											'is-hovered'
										}}"
									{{on
										"mouseenter"
										(fn
											this.hoverCorner
											row.key
										)
									}}
									{{on
										"mouseleave"
										this.clearCornerHover
									}}
								>
									<span
										class="dt-gradient-row-swatch"
									>
										<span
											style={{row.fillStyle}}
											aria-hidden="true"
										></span>
										<input
											type="color"
											value={{row.colour}}
											aria-label="Edit
												{{row.label}}"
											{{on
												"input"
												(fn
													this.setCorner
													row.key
												)
											}}
										/>
									</span>
									<div
										class="dt-gradient-corner-info"
									>
										<div
											class="dt-gradient-corner-head"
										>
											<span
												class="dt-gradient-corner-label"
											>{{row.label}}</span>
											<span
												class="dt-gradient-corner-name"
											>{{row.name}}</span>
										</div>
										<input
											type="text"
											class="dt-gradient-row-hex"
											value={{row.colour}}
											aria-label="{{row.label}}
												hex"
											{{on
												"change"
												(fn
													this.setCorner
													row.key
												)
											}}
										/>
									</div>
								</div>
							{{/each}}
						</div>
					</section>
				{{/if}}

				{{#if this.isMesh}}
					<section class="dt-gradient-block">
						<span
							class="dt-gradient-label"
						>Grid Size</span>
						<div
							class="segmented dt-gradient-presets is-grid"
						>
							<button
								type="button"
								class="dt-gradient-preset
									{{if
										(eq
											this.gridSize
											2
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setGridSize
										2
									)
								}}
							>2x2</button>
							<button
								type="button"
								class="dt-gradient-preset
									{{if
										(eq
											this.gridSize
											3
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setGridSize
										3
									)
								}}
							>3x3</button>
						</div>
					</section>

					<section class="dt-gradient-block">
						<span
							class="dt-gradient-label"
						>Control Points</span>
						<div class="dt-gradient-rows">
							{{#each
								this.meshRows
								key="id"
								as |row|
							}}
								<div
									class="dt-gradient-row
										{{if
											row.isHovered
											'is-hovered'
										}}"
									{{on
										"mouseenter"
										(fn
											this.hoverPoint
											row.id
										)
									}}
									{{on
										"mouseleave"
										this.clearPointHover
									}}
								>
									<span
										class="dt-gradient-row-badge"
									>
										<span
											style={{row.badgeStyle}}
										>{{row.number}}</span>
									</span>
									<span
										class="dt-gradient-row-swatch"
									>
										<span
											style={{row.fillStyle}}
											aria-hidden="true"
										></span>
										<input
											type="color"
											value={{row.colour}}
											aria-label="Edit
												{{row.name}}"
											{{on
												"input"
												(fn
													this.setPointColour
													row.id
												)
											}}
										/>
									</span>
									<span
										class="dt-gradient-row-info"
									>
										<span
											class="dt-gradient-row-name"
										>{{row.name}}</span>
										<span
											class="dt-gradient-row-value"
										>{{row.value}}</span>
									</span>
									<span
										class="dt-gradient-row-coords"
									>{{row.position}}</span>
								</div>
							{{/each}}
						</div>
					</section>
				{{/if}}

				<section class="dt-gradient-block is-last">
					<div class="dt-gradient-block-head">
						<span
							class="dt-gradient-label"
						>Noise</span>
						<span
							class="dt-gradient-readout"
						>{{this.noise}}%</span>
					</div>
					<input
						type="range"
						class="dt-gradient-slider"
						min="0"
						max="100"
						step="1"
						value={{this.noise}}
						aria-label="Noise"
						{{on "input" this.setNoise}}
					/>
					{{#if this.isCorners}}
						{{! wording carried over from the Next app }}
						<p class="dt-gradient-note">Adds
							grain texture to reduce
							banding in smooth
							gradients</p>
					{{else}}
						{{! wording carried over from the Next app }}
						<p class="dt-gradient-note">Adds
							grain texture to reduce
							banding. Only applies to
							image export, not CSS.</p>
					{{/if}}
				</section>
			</div>

			<div class="dt-gradient-export">
				<div class="dt-gradient-export-pane">
					<div class="dt-gradient-export-body">
						<span
							class="dt-gradient-label"
						>Image Export</span>

						<div class="dt-gradient-size">
							<input
								type="number"
								min={{MIN_EXPORT}}
								max={{MAX_EXPORT}}
								value={{this.exportWidth}}
								aria-label="Export width"
								{{on
									"input"
									this.setExportWidth
								}}
							/>
							<span>×</span>
							<input
								type="number"
								min={{MIN_EXPORT}}
								max={{MAX_EXPORT}}
								value={{this.exportHeight}}
								aria-label="Export height"
								{{on
									"input"
									this.setExportHeight
								}}
							/>
							<span>px</span>
						</div>

						<div
							class="segmented dt-gradient-presets is-sizes"
						>
							{{#each
								this.sizePresets
								key="label"
								as |preset|
							}}
								<button
									type="button"
									class="dt-gradient-preset
										{{if
											preset.isActive
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setSizePreset
											preset.w
											preset.h
										)
									}}
								>{{preset.label}}</button>
							{{/each}}
						</div>

						{{#if this.noise}}
							{{! wording carried over from the Next app }}
							<p
								class="dt-gradient-note"
							>{{this.noise}}% noise
								will be applied
								to the exported
								image</p>
						{{/if}}
					</div>

					<button
						type="button"
						class="dt-gradient-action is-primary"
						{{on
							"click"
							this.downloadImage
						}}
					>
						<Icon @name="download" />
						Download PNG
					</button>
				</div>

				<div class="dt-gradient-export-pane">
					<div class="dt-gradient-export-body">
						<span
							class="dt-gradient-label"
						>CSS</span>
						<pre
							class="dt-gradient-css"
						>{{this.cssText}}</pre>
						{{#if this.isMesh}}
							{{! wording carried over from the Next app }}
							<p
								class="dt-gradient-note"
							>Mesh gradients can't be
								perfectly
								replicated in
								CSS. Use image
								export for
								accurate
								results.</p>
						{{/if}}
					</div>

					<button
						type="button"
						class="dt-gradient-action"
						{{on "click" this.copyCss}}
					>
						<Icon
							@name={{if
								(eq
									this.copied
									"css"
								)
								"check"
								"copy"
							}}
						/>
						{{if
							(eq this.copied "css")
							"Copied!"
							"Copy CSS"
						}}
					</button>
				</div>
			</div>
		</div>
	</template>
}
