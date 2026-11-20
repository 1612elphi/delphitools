import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import ToolPanel from 'delphitools-v2/components/errata/tool-panel';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import { newId, pageSize } from 'delphitools-v2/lib/errata/doc-model';
import {
	addSignature,
	removeSignature,
	signatures,
	trimCanvas,
} from 'delphitools-v2/lib/errata/signatures';
import { addObject, currentPage } from 'delphitools-v2/lib/errata/store';
import { activeTool } from 'delphitools-v2/lib/errata/tool';
import {
	boxMode,
	closeMode,
	modal,
	pushDismiss,
	selectObject,
	toolbox,
} from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './signature-modal.css';

const PAD_W = 480;
const PAD_H = 180;
const PLACED_WIDTH = 180;

function placeSignature(dataUrl: string): void {
	const page = currentPage();
	if (!page) return;
	const img = new Image();
	img.onload = () => {
		const { width, height } = pageSize(page);
		const w = PLACED_WIDTH;
		const h = (img.naturalHeight / img.naturalWidth) * w;
		const id = newId();
		addObject(page.id, {
			id,
			kind: 'image',
			cx: width / 2,
			cy: height / 2,
			w,
			h,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			dataUrl,
		});
		activeTool.set('select');
		selectObject(id);
	};
	img.src = dataUrl;
}

export default class SignatureModal extends Component {
	shown = new TrackedExternal(modal.subscribe, modal.get);
	saved = new TrackedExternal(signatures.subscribe, signatures.get);
	#pad: HTMLCanvasElement | null = null;
	#input: HTMLInputElement | null = null;
	#whileOpen: (() => void)[] = [];
	#offModal = modal.subscribe(() =>
		this.opened(modal.get() === 'signature'),
	);

	willDestroy() {
		super.willDestroy();
		this.shown.unsubscribe();
		this.saved.unsubscribe();
		this.#offModal();
		this.opened(false);
		modal.set(null);
	}

	opened(open: boolean) {
		for (const off of this.#whileOpen.splice(0)) off();
		if (!open) return;
		closeMode();
		toolbox.set(false);
		this.#whileOpen.push(
			pushDismiss(this.onClose),
			boxMode.subscribe(() => {
				if (boxMode.get()) this.onClose();
			}),
			toolbox.subscribe(() => {
				if (toolbox.get()) this.onClose();
			}),
		);
	}

	onClose = () => {
		modal.set(null);
	};

	get open() {
		return this.shown.current === 'signature';
	}

	pad = modifier((canvas: HTMLCanvasElement) => {
		this.#pad = canvas;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = PAD_W * dpr;
		canvas.height = PAD_H * dpr;
		const ctx = canvas.getContext('2d')!;
		ctx.scale(dpr, dpr);
		ctx.lineWidth = 2.5;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = '#111';
		let drawing = false;
		const pt = (e: PointerEvent) => {
			const r = canvas.getBoundingClientRect();
			return [
				((e.clientX - r.left) * PAD_W) / r.width,
				((e.clientY - r.top) * PAD_H) / r.height,
			] as const;
		};
		const down = (e: PointerEvent) => {
			drawing = true;
			canvas.setPointerCapture(e.pointerId);
			ctx.beginPath();
			ctx.moveTo(...pt(e));
		};
		const move = (e: PointerEvent) => {
			if (!drawing) return;
			ctx.lineTo(...pt(e));
			ctx.stroke();
		};
		const up = () => {
			drawing = false;
		};
		canvas.addEventListener('pointerdown', down);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('pointercancel', up);
		return () => {
			canvas.removeEventListener('pointerdown', down);
			canvas.removeEventListener('pointermove', move);
			canvas.removeEventListener('pointerup', up);
			canvas.removeEventListener('pointercancel', up);
			this.#pad = null;
		};
	});

	clear = () => {
		const pad = this.#pad;
		if (pad)
			pad.getContext('2d')!.clearRect(
				0,
				0,
				pad.width,
				pad.height,
			);
	};

	useDrawn = () => {
		const pad = this.#pad;
		if (!pad) return;
		const trimmed = trimCanvas(pad);
		if (!trimmed) return;
		const dataUrl = trimmed.toDataURL('image/png');
		addSignature(dataUrl);
		this.clear();
		placeSignature(dataUrl);
		modal.set(null);
	};

	registerInput = modifier((el: HTMLInputElement) => {
		this.#input = el;
		return () => {
			this.#input = null;
		};
	});

	pickUpload = () => this.#input?.click();

	onUpload = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			addSignature(dataUrl);
			placeSignature(dataUrl);
			modal.set(null);
		};
		reader.readAsDataURL(file);
	};

	place = (dataUrl: string) => {
		placeSignature(dataUrl);
		modal.set(null);
	};

	remove = (dataUrl: string) => removeSignature(dataUrl);

	<template>
		<ToolPanel
			class="err-sig"
			@open={{this.open}}
			@mode="signature"
			@icon="signature"
			@label="Signatures"
			@onCancel={{this.onClose}}
			@onApply={{this.useDrawn}}
			@applyLabel="Place"
		>
			<:actions>
				<Cell
					@label="Upload"
					@text="Upload"
					@icon="upload"
					@onClick={{this.pickUpload}}
				/>
				<Cell
					@label="Clear"
					@text="Clear"
					@icon="eraser"
					@onClick={{this.clear}}
				/>
			</:actions>
			<:default>
				<div class="err-sig-draw">
					<canvas
						class="err-sig-pad"
						aria-label="Draw signature"
						{{this.pad}}
					></canvas>
					<input
						type="file"
						accept="image/png,image/jpeg"
						class="dt-sr-only"
						aria-label="Upload signature"
						{{this.registerInput}}
						{{on "change" this.onUpload}}
					/>
				</div>
				{{#if this.saved.current.length}}
					<div class="err-sig-grid">
						{{#each
							this.saved.current
							as |url|
						}}
							<div
								class="err-sig-cell"
							>
								<button
									type="button"
									class="err-sig-place"
									aria-label="Place signature"
									title="Place signature"
									{{on
										"click"
										(fn
											this.place
											url
										)
									}}
								>
									<img
										src={{url}}
										alt=""
										class="err-sig-img"
									/>
								</button>
								<Cell
									class="err-sig-remove"
									@label="Remove signature"
									@icon="x"
									@onClick={{fn
										this.remove
										url
									}}
								/>
							</div>
						{{/each}}
					</div>
				{{/if}}
			</:default>
		</ToolPanel>
	</template>
}
