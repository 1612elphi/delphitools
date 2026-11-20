import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import CanonStatus from 'delphicanon/components/canon-status';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import { countOf, develop, evict, proxyOf, type Histogram } from './render';

interface PictureSignature {
	Args: {
		layer: RasterLayer;
		lutEpoch: number;
		onCount: (histogram: Histogram) => void;
	};
}

const STEP = 512;
const HOLD_MS = 120;

export default class DevelopPicture extends Component<PictureSignature> {
	@tracked box = { width: 0, height: 0 };
	@tracked holding = false;

	#proxy: HTMLCanvasElement | null = null;
	#proxyKey = '';
	#developed = document.createElement('canvas');
	#developedKey = '';
	#counted = '';
	#cacheKey = '';
	#frame = 0;

	size = modifier((host: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.box = {
				width: host.clientWidth,
				height: host.clientHeight,
			};
		});
		observer.observe(host);
		return () => observer.disconnect();
	});

	hold = modifier((host: HTMLElement) => {
		let timer = 0;
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			timer = window.setTimeout(
				() => (this.holding = true),
				HOLD_MS,
			);
		};
		const up = () => {
			window.clearTimeout(timer);
			this.holding = false;
		};
		const ends = [
			'pointerup',
			'pointercancel',
			'pointerleave',
		] as const;
		host.addEventListener('pointerdown', down);
		ends.forEach((type) => host.addEventListener(type, up));
		return () => {
			up();
			host.removeEventListener('pointerdown', down);
			ends.forEach((type) =>
				host.removeEventListener(type, up),
			);
		};
	});

	paint = modifier(
		(
			view: HTMLCanvasElement,
			[layer, holding, box, epoch]: [
				RasterLayer,
				boolean,
				{ width: number; height: number },
				number,
			],
		) => {
			cancelAnimationFrame(this.#frame);
			this.#frame = requestAnimationFrame(() =>
				this.draw(view, layer, holding, box, epoch),
			);
		},
	);

	draw(
		view: HTMLCanvasElement,
		layer: RasterLayer,
		holding: boolean,
		box: { width: number; height: number },
		epoch: number,
	) {
		if (!box.width || !box.height) return;
		const dpr = window.devicePixelRatio || 1;
		const need =
			Math.ceil(
				(Math.max(box.width, box.height) * dpr) / STEP,
			) * STEP;
		const crop = JSON.stringify(layer.crop ?? null);
		const proxyKey = `${layer.blobHash}|${crop}`;
		if (
			!this.#proxy ||
			proxyKey !== this.#proxyKey ||
			need >
				Math.max(
					this.#proxy.width,
					this.#proxy.height,
				) +
					1
		) {
			this.#proxy = proxyOf(layer, need);
			this.#proxyKey = proxyKey;
			if (this.#cacheKey) evict(this.#cacheKey);
			this.#cacheKey = `sub-develop-${proxyKey}-${need}`;
			this.#developedKey = '';
		}
		const proxy = this.#proxy;
		if (!proxy) return;
		const developedKey = `${epoch}|${JSON.stringify(layer.filters)}`;
		if (developedKey !== this.#developedKey) {
			develop(proxy, layer, this.#developed, this.#cacheKey);
			this.#developedKey = developedKey;
		}
		const shown = holding ? proxy : this.#developed;
		view.width = Math.round(box.width * dpr);
		view.height = Math.round(box.height * dpr);
		const ctx = view.getContext('2d')!;
		const scale = Math.min(
			view.width / shown.width,
			view.height / shown.height,
		);
		const w = shown.width * scale;
		const h = shown.height * scale;
		ctx.clearRect(0, 0, view.width, view.height);
		ctx.drawImage(
			shown,
			(view.width - w) / 2,
			(view.height - h) / 2,
			w,
			h,
		);
		if (!holding && this.#counted !== developedKey) {
			this.#counted = developedKey;
			this.args.onCount(countOf(this.#developed));
		}
	}

	willDestroy() {
		super.willDestroy();
		cancelAnimationFrame(this.#frame);
		if (this.#cacheKey) evict(this.#cacheKey);
	}

	<template>
		<div class="sub-dev-picture" {{this.size}} {{this.hold}}>
			<canvas
				class="sub-dev-picture-canvas"
				role="img"
				aria-label={{@layer.name}}
				{{this.paint
					@layer
					this.holding
					this.box
					@lutEpoch
				}}
			></canvas>
			<CanonStatus
				class="sub-dev-before
					{{if this.holding 'is-shown'}}"
				@text="Before"
				@tone="muted"
			/>
		</div>
	</template>
}
