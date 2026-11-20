import type { TOC } from '@ember/component/template-only';

const GalleryArt: TOC<{ Args: { label: string } }> = <template>
	<div class="cd-art"><span>{{@label}}</span></div>
</template>;

export default GalleryArt;
