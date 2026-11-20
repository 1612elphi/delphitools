import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonImageCompare from 'delphicanon/components/canon-image-compare';
import CanonLoader from 'delphicanon/components/canon-loader';
import type { Rgb } from 'delphicanon/lib/colour';
import Slot from 'delphitools-v2/components/tools/media/slot';

const grey: Rgb = [0.5, 0.5, 0.5];

const filled = (palette?: Rgb[]) => (palette?.length ?? 0) > 0;

const boxStyle = (aspect: number) => htmlSafe(`--trace-aspect: ${aspect}`);

const TracerPicture: TOC<{
	Blocks: { default: [] };
	Args: {
		before?: string;
		after?: string;
		aspect: number;
		palette?: Rgb[];
		tracing: boolean;
		over: boolean;
		onFile: (file: File) => void;
	};
}> = <template>
	<div class="trace-picture">
		<div class="trace-area">
			{{#if @before}}
				<div
					class="trace-box"
					style={{boxStyle @aspect}}
				>
					<CanonImageCompare
						class="trace-compare"
						@before={{@before}}
						@after={{@after}}
						@beforeTitle="Original"
						@afterTitle="SVG"
					/>
					{{yield}}
					{{#if @tracing}}
						<div
							class="trace-busy
								{{if
									@after
									'trace-busy--corner'
								}}"
						>
							<CanonLoader />
						</div>
					{{/if}}
				</div>
			{{else}}
				<Slot
					class="trace-slot"
					@prompt="Drop an image here"
					@icon="spline"
					@dashed={{true}}
					@fills={{true}}
					@over={{@over}}
					@accept="image/*"
					@onFile={{@onFile}}
				/>
				{{#if @tracing}}
					<div class="trace-busy">
						<CanonLoader />
					</div>
				{{/if}}
			{{/if}}
		</div>
		{{#if (filled @palette)}}
			<CanonColourStrip
				class="trace-strip"
				@colour={{grey}}
				@palette={{@palette}}
			/>
		{{/if}}
	</div>
</template>;

export default TracerPicture;
