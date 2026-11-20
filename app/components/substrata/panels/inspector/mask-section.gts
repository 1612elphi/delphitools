import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import { IconSvg } from 'delphitools-v2/components/icon';
import MaskGrid from 'delphitools-v2/components/mask-grid';
import type { MaskShape } from 'delphitools-v2/lib/mask-shapes';
import type { Layer } from 'delphitools-v2/lib/substrata/doc-model';
import { setMask } from 'delphitools-v2/lib/substrata/layer-ops';

export default class MaskSection extends Component<{
	Args: { layer: Layer };
}> {
	@tracked open = false;

	get mask() {
		return this.args.layer.mask ?? null;
	}

	get title(): string {
		return this.mask?.label ?? 'None';
	}

	toggle = () => {
		this.open = !this.open;
	};

	pick = (shape: MaskShape) =>
		setMask(this.args.layer.id, { d: shape.d, label: shape.label });

	clear = () => setMask(this.args.layer.id, null);

	<template>
		<CanonHeading @text="Mask" />
		<CanonRow
			class="sub-ip-mask"
			@title={{this.title}}
			@form="flush"
		>
			{{#if this.mask}}
				<CanonButton
					@kind="cell"
					@icon={{component IconSvg name="x"}}
					@label="Clear mask"
					@onClick={{this.clear}}
					title="Clear mask"
				/>
			{{/if}}
			<CanonButton
				@kind="segment"
				@text="Shapes"
				@icon={{component IconSvg name="shapes"}}
				@selected={{this.open}}
				@onClick={{this.toggle}}
				aria-expanded={{if this.open "true" "false"}}
			/>
		</CanonRow>
		{{#if this.open}}
			<div class="sub-ip-mask-grid">
				<MaskGrid
					@selected={{this.mask.d}}
					@onSelect={{this.pick}}
				/>
			</div>
		{{/if}}
	</template>
}
