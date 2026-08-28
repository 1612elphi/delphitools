import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import { capturing, passAlong } from 'delphitools-v2/lib/flow-hooks';

const labelOf = (label?: string) => label ?? 'Download';
const iconOn = (icon?: boolean) => icon !== false;

const DownloadLabel: TOC<{
	Args: { label?: string; icon?: boolean; busy?: boolean };
}> = <template>
	{{#if @busy}}
		<NdsLoader />
		<span>{{passAlong (labelOf @label)}}</span>
	{{else if (capturing)}}
		<span>{{passAlong (labelOf @label)}}</span>
		<Icon @name="arrow-right" />
	{{else}}
		{{#if (iconOn @icon)}}
			<Icon @name="download" />
		{{/if}}
		<span>{{labelOf @label}}</span>
	{{/if}}
</template>;

export default DownloadLabel;
