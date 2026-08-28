// fabric requires browser
import { IText } from 'fabric';
import type { TextPlate } from './doc-model';

export class SubstrataText extends IText {
	plate: TextPlate | null = null;

	override _getCacheCanvasDimensions() {
		const dims = super._getCacheCanvasDimensions();
		const pad = this.plate?.padding ?? 0;
		if (pad > 0) {
			dims.width +=
				2 *
				Math.ceil(
					(pad * dims.zoomX) /
						(Math.abs(this.scaleX) || 1),
				);
			dims.height +=
				2 *
				Math.ceil(
					(pad * dims.zoomY) /
						(Math.abs(this.scaleY) || 1),
				);
		}
		return dims;
	}

	override drawObject(
		ctx: CanvasRenderingContext2D,
		forClipping: boolean | undefined,
		context: Parameters<IText['drawObject']>[2],
	): void {
		const plate = this.plate;
		if (plate && !forClipping) {
			const w = this.width + plate.padding * 2;
			const h = this.height + plate.padding * 2;
			const r =
				plate.shape === 'pill'
					? h / 2
					: Math.min(12, plate.padding);
			ctx.save();
			ctx.fillStyle = plate.colour;
			ctx.beginPath();
			ctx.roundRect(-w / 2, -h / 2, w, h, r);
			ctx.fill();
			ctx.restore();
		}
		super.drawObject(ctx, forClipping, context);
	}
}
