// fabric requires client rendering

import { FabricImage } from 'fabric';
import type { Effect } from './doc-model';
import { effectsReach, getScratch, paintEffects } from './effect-render';
import { ensureMatte, getMatte, matteEpoch } from './bg-removal';

type DrawContext = Parameters<FabricImage['drawObject']>[2];

export class EffectsImage extends FabricImage {
	effects: Effect[] = [];

	sourceHash = '';

	private _matteEpochSeen = -1;

	private hasCutout(): boolean {
		return this.effects.some((e) => e.type === 'remove-background');
	}

	private _reachFor?: readonly Effect[];
	private _reach = 0;

	private _composedPose = '';

	// effects require object caching
	override needsItsOwnCache(): boolean {
		return this.effects.length > 0 || super.needsItsOwnCache();
	}

	// fabric skips transform invalidation
	override isCacheDirty(skipCanvas?: boolean): boolean {
		if (
			this.effects.length > 0 &&
			this.pose() !== this._composedPose
		)
			this.dirty = true;
		// matte epoch invalidates cache
		if (this.hasCutout() && this._matteEpochSeen !== matteEpoch())
			this.dirty = true;
		return super.isCacheDirty(skipCanvas);
	}

	private pose(): string {
		return `${this.getTotalAngle()}|${this.flipX}|${this.flipY}`;
	}

	override _getCacheCanvasDimensions() {
		const dims = super._getCacheCanvasDimensions();
		if (this._reachFor !== this.effects) {
			this._reachFor = this.effects;
			this._reach = effectsReach(this.effects);
		}
		const reach = this._reach;
		if (reach > 0) {
			// use uncapped zoom
			dims.width +=
				2 *
				Math.ceil(
					(reach * dims.zoomX) /
						(Math.abs(this.scaleX) || 1),
				);
			dims.height +=
				2 *
				Math.ceil(
					(reach * dims.zoomY) /
						(Math.abs(this.scaleY) || 1),
				);
		}
		return dims;
	}

	override drawObject(
		ctx: CanvasRenderingContext2D,
		forClipping: boolean | undefined,
		context: DrawContext,
	): void {
		if (forClipping || this.effects.length === 0) {
			super.drawObject(ctx, forClipping, context);
			return;
		}
		// retain cache transform
		const t = ctx.getTransform();
		const content = getScratch(
			0,
			ctx.canvas.width,
			ctx.canvas.height,
		);
		content.setTransform(t);
		super.drawObject(content, forClipping, context);
		if (this.hasCutout()) {
			const matte = getMatte(this.sourceHash);
			if (matte) {
				content.globalCompositeOperation =
					'destination-in';
				content.drawImage(
					matte,
					-this.width / 2,
					-this.height / 2,
					this.width,
					this.height,
				);
				content.globalCompositeOperation =
					'source-over';
			} else {
				ensureMatte(this.sourceHash);
			}
			this._matteEpochSeen = matteEpoch();
		}
		paintEffects(ctx, content.canvas, this.effects, {
			kx: t.a / (Math.abs(this.scaleX) || 1),
			ky: t.d / (Math.abs(this.scaleY) || 1),
			angle: this.getTotalAngle(),
			flipX: this.flipX,
			flipY: this.flipY,
		});
		this._composedPose = this.pose();
	}
}
