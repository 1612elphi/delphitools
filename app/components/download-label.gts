import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import { capturing, passAlong } from 'delphitools-v2/lib/flow-hooks';

const labelOf = (label?: string) => label ?? 'Download';
const iconOn = (icon?: boolean) => icon !== false;

/**
 * The content of a control that saves a file: its own label outside a
 * workflow, "Pass along" with an arrow while a later step waits for the
 * file (lib/download.ts captures the blob instead of saving it). `@icon`
 * off only for text-only controls; `@busy` swaps the icon for the loader
 * while the tool works.
 */
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
