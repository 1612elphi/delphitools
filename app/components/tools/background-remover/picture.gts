import type { TOC } from '@ember/component/template-only';
import type { SafeString } from '@ember/template';
import type { ModifierLike } from '@glint/template';
import { htmlSafe } from '@ember/template';
import CanonLoader from 'delphicanon/components/canon-loader';
import Slot from 'delphitools-v2/components/tools/media/slot';

interface CutoutPictureSignature {
	Args: {
		source?: string | null;
		width?: number;
		height?: number;
		done?: boolean;
		cut?: ModifierLike<{ Element: HTMLCanvasElement }>;
		ring?: SafeString;
		fill?: string;
		busy: boolean;
		over: boolean;
		onChoose: () => void;
	};
}

const boxStyle = (width = 4, height = 3, fill?: string) =>
	htmlSafe(
		[
			`--cutout-aspect: ${width} / ${height}`,
			fill && `--cutout-fill: ${fill}`,
		]
			.filter(Boolean)
			.join('; '),
	);

const CutoutPicture: TOC<CutoutPictureSignature> = <template>
	<div class="cutout-picture">
		<div class="cutout-area">
			{{#if @source}}
				<div
					class="cutout-box
						{{if
							@fill
							'cutout-box--filled'
						}}
						{{if @done 'cutout-box--done'}}"
					style={{boxStyle @width @height @fill}}
				>
					<span
						class="cutout-name"
						role="img"
						aria-label="Preview"
					></span>
					<img
						class="cutout-ghost"
						src={{@source}}
						alt=""
					/>
					{{#if @done}}
						<canvas
							class="cutout-cut"
							{{@cut}}
						></canvas>
						{{#if @ring}}
							<span
								class="cutout-ring"
								style={{@ring}}
							></span>
						{{/if}}
					{{/if}}
				</div>
			{{else}}
				<div
					class="cutout-box cutout-box--empty"
					style={{(boxStyle)}}
				>
					<Slot
						class="cutout-slot"
						@prompt="Drop an image here"
						@icon="image"
						@dashed={{true}}
						@fills={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				</div>
			{{/if}}
		</div>
		{{#if @busy}}
			<CanonLoader class="cutout-loader" />
		{{/if}}
	</div>
</template>;

export default CutoutPicture;
