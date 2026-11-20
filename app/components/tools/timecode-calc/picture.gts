import type { TOC } from '@ember/component/template-only';
import CanonTimecode from 'delphicanon/components/canon-timecode';

interface PictureSignature {
	Args: { a: string; b: string; subtracts: boolean; result: string };
}

const size = 30;
const halo = 'var(--canon-card)';

const Picture: TOC<PictureSignature> = <template>
	<div class="tcc-picture">
		<div class="tcc-sum">
			<CanonTimecode
				class="tcc-line tcc-operand"
				@text={{@a}}
				@size={{size}}
				@halo={{halo}}
				@label="Timecode A"
			/>
			<div class="tcc-row">
				<span class="tcc-sign">{{if
						@subtracts
						"−"
						"+"
					}}</span>
				<CanonTimecode
					class="tcc-line tcc-operand"
					@text={{@b}}
					@size={{size}}
					@halo={{halo}}
					@label="Timecode B"
				/>
			</div>
			<div class="tcc-rule"></div>
			<CanonTimecode
				class="tcc-line"
				@text={{@result}}
				@size={{size}}
				@halo={{halo}}
				@label="Result"
			/>
		</div>
	</div>
</template>;

export default Picture;
