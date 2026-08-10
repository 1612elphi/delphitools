import Component from '@glimmer/component';
import { ModuleBox } from 'delphitools-v2/components/substrata/omnibar/modules';
import {
	getModuleDockAll,
	subscribeDock,
} from 'delphitools-v2/lib/substrata/dock-pref';
import {
	getPinned,
	subscribePins,
	type ModuleId,
} from 'delphitools-v2/lib/substrata/pin-pref';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export interface RailSignature {
	Element: HTMLDivElement;
	Args: { vertical: boolean };
}

/**
 * Utility rail (§8) — the pinned modules at uniform height, on the canvas side
 * of the omnibar. Modules fade + rise in on pin (CSS animation, honouring
 * prefers-reduced-motion); unpinning removes them at once, because the Next
 * app's exit animation came from motion/react, which is not installed here.
 * Horizontal row for top/bottom docking, vertical column for left/right.
 * Renders nothing when empty, so the dock leaves no phantom gap.
 */
export default class Rail extends Component<RailSignature> {
	pinned = new TrackedExternal(subscribePins, getPinned);
	docks = new TrackedExternal(subscribeDock, getModuleDockAll);

	willDestroy() {
		super.willDestroy();
		this.pinned.unsubscribe();
		this.docks.unsubscribe();
	}

	get railModules(): readonly ModuleId[] {
		const docks = this.docks.current;
		return this.pinned.current.filter((id) => docks[id] === 'rail');
	}

	<template>
		{{#if this.railModules.length}}
			<div
				class="sub-rail pointer-events-auto
					{{if @vertical 'is-vertical'}}"
				...attributes
			>
				{{#each
					this.railModules key="@identity"
					as |id|
				}}
					<div
						class="sub-rail-item border shadow-lg"
					>
						<ModuleBox
							@id={{id}}
							@variant="rail"
						/>
					</div>
				{{/each}}
			</div>
		{{/if}}
	</template>
}
