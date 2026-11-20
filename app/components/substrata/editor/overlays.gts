import ColourRing from 'delphitools-v2/components/substrata/colour/ring';
import SettingsPage from 'delphitools-v2/components/substrata/pages/settings-page';
import Gallery from 'delphitools-v2/components/substrata/pages/gallery';
import ExportPopover from 'delphitools-v2/components/substrata/pages/export-popover';
import HelpOverlay from 'delphitools-v2/components/substrata/pages/help-overlay';
import Develop from 'delphitools-v2/components/substrata/develop/develop';
import LayerMenu from 'delphitools-v2/components/substrata/panels/layers/layer-menu';

import type { TOC } from '@ember/component/template-only';

const Overlays: TOC<{ Args: { phone: boolean } }> = <template>
	<ColourRing @phone={{@phone}} />
	<SettingsPage @phone={{@phone}} />
	<Gallery @phone={{@phone}} />
	<ExportPopover @phone={{@phone}} />
	<HelpOverlay @phone={{@phone}} />
	<Develop @phone={{@phone}} />
	<LayerMenu />
</template>;

export default Overlays;
