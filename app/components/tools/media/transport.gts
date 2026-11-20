import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import { IconSvg } from 'delphitools-v2/components/icon';
import type Playback from 'delphitools-v2/components/tools/media/playback';

const PlayIcon = <template><IconSvg @name="play" /></template>;
const PauseIcon = <template><IconSvg @name="pause" /></template>;
const StopIcon = <template><IconSvg @name="square" /></template>;
const LoopIcon = <template><IconSvg @name="repeat" /></template>;

const off = (on: boolean | undefined) => !on;

const Transport: TOC<{
	Args: { playback: Playback; ready?: boolean };
	Blocks: { default: []; before: [] };
}> = <template>
	<CanonGrid class="media-transport">
		{{yield to="before"}}
		<CanonButton
			class="media-loop"
			@text="Loop"
			@icon={{LoopIcon}}
			@selected={{@playback.looping}}
			@disabled={{off @ready}}
			@onClick={{@playback.toggleLoop}}
			aria-pressed={{if @playback.looping "true" "false"}}
		/>
		<CanonButton
			class="media-play"
			@kind="primary"
			@text={{if @playback.playing "Pause" "Play"}}
			@icon={{if @playback.playing PauseIcon PlayIcon}}
			@disabled={{off @ready}}
			@onClick={{@playback.toggle}}
		/>
		<CanonButton
			class="media-stop"
			@text="Stop"
			@icon={{StopIcon}}
			@disabled={{off @playback.active}}
			@onClick={{@playback.stop}}
		/>
		{{yield}}
	</CanonGrid>
</template>;

export default Transport;
