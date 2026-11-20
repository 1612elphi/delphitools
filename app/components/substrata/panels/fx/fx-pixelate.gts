import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import FxStepperRow from './fx-stepper-row';
import { numberOf, type FxContext } from './fx-context';
import { fieldColour } from './fx-maths';

const HEIGHT = 88;

export default class FxPixelate extends Component<{
	Args: { ctx: FxContext };
}> {
	@tracked width = 0;

	get block() {
		return Math.max(
			2,
			Math.round(numberOf(this.args.ctx, 'blockSize')),
		);
	}

	measure = modifier((el: HTMLElement) => {
		const ro = new ResizeObserver(() => {
			this.width = el.clientWidth;
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	draw = modifier(
		(
			canvas: HTMLCanvasElement,
			[block, width]: [number, number],
		) => {
			if (width <= 0) return;
			const cols = Math.ceil(width / block);
			const rows = Math.ceil(HEIGHT / block);
			canvas.width = cols;
			canvas.height = rows;
			canvas.style.inlineSize = `${cols * block}px`;
			canvas.style.blockSize = `${rows * block}px`;
			const data = new Uint8ClampedArray(cols * rows * 4);
			for (let r = 0; r < rows; r++)
				for (let c = 0; c < cols; c++) {
					const rgb = fieldColour(
						(c * block) / width,
						(r * block) / HEIGHT,
					);
					const i = (r * cols + c) * 4;
					rgb.forEach(
						(v, k) =>
							(data[i + k] =
								Math.round(
									v * 255,
								)),
					);
					data[i + 3] = 255;
				}
			canvas.getContext('2d')?.putImageData(
				new ImageData(data, cols, rows),
				0,
				0,
			);
		},
	);

	<template>
		<div
			class="sub-fxp-pixelate"
			aria-hidden="true"
			{{this.measure}}
		>
			<canvas {{this.draw this.block this.width}}></canvas>
		</div>
		<FxStepperRow @ctx={{@ctx}} @key="blockSize" />
	</template>
}
