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

// motion/react not installed, so entry anim is CSS
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
