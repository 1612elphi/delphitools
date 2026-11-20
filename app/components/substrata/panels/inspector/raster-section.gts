import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import { setCrop } from 'delphitools-v2/lib/substrata/layer-ops';
import { pickFrameImage } from 'delphitools-v2/lib/substrata/strata';

const size = (l: RasterLayer) => `${l.naturalWidth} × ${l.naturalHeight} px`;
const resetCrop = (l: RasterLayer) => () => setCrop(l.id, null);
const uncropped = (l: RasterLayer) => !l.crop;
const replace = (l: RasterLayer) => () => pickFrameImage(l.id);

const RasterSection: TOC<{ Args: { layer: RasterLayer } }> = <template>
	<CanonHeading @text="Image" />
	<CanonRow @title="Size">
		<span class="sub-ip-fact">{{size @layer}}</span>
	</CanonRow>
	{{#if @layer.stratum}}
		<CanonRow @title="Frame" @form="flush">
			<CanonButton
				@kind="cell"
				@text="Replace…"
				@icon={{component IconSvg name="image-plus"}}
				@onClick={{replace @layer}}
			/>
		</CanonRow>
	{{/if}}
	<CanonRow @title="Crop" @form="flush">
		<CanonButton
			@kind="cell"
			@text="Reset"
			@icon={{component IconSvg name="crop"}}
			@disabled={{uncropped @layer}}
			@onClick={{resetCrop @layer}}
		/>
	</CanonRow>
</template>;

export default RasterSection;
