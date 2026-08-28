import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import {
	getPinned,
	subscribePins,
	type ModuleId,
} from 'delphitools-v2/lib/substrata/pin-pref';
import {
	getClampedAll,
	getFloatPosAll,
	getModuleDockAll,
	subscribeDock,
} from 'delphitools-v2/lib/substrata/dock-pref';
import {
	ModuleBox,
	ModuleHeader,
	MODULES,
} from 'delphitools-v2/components/substrata/omnibar/modules';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';


interface FloatPanelSignature {
	Args: {
		id: ModuleId;
		pos: { x: number; y: number };
		clamped: boolean;
	};
}

class FloatPanel extends Component<FloatPanelSignature> {
	@tracked hot = false;

	get full() {
		return this.args.clamped || this.hot;
	}

	get posStyle() {
		return htmlSafe(
			`left: ${this.args.pos.x}px; top: ${this.args.pos.y}px`,
		);
	}

	get hasSub() {
		return MODULES[this.args.id].sub != null;
	}

	// defer glimmer state write
	#setHot(next: boolean) {
		queueMicrotask(() => {
			if (!this.isDestroying) this.hot = next;
		});
	}

	enter = () => this.#setHot(true);
	leave = () => this.#setHot(false);
	focusIn = () => this.#setHot(true);
	focusOut = (e: FocusEvent) => {
		const root = e.currentTarget as HTMLElement;
		if (!root.contains(e.relatedTarget as Node | null))
			this.#setHot(false);
	};

	<template>
		<div
			data-float-panel={{@id}}
			class="sub-float-panel"
			style={{this.posStyle}}
			{{on "pointerenter" this.enter}}
			{{on "pointerleave" this.leave}}
			{{on "focusin" this.focusIn}}
			{{on "focusout" this.focusOut}}
		>
			{{! harness selector }}
			<div class="sub-float-card shadow-lg">
				{{#if this.full}}
					<ModuleBox
						@id={{@id}}
						@variant="float"
						@clamped={{@clamped}}
					/>
				{{else}}
					<div
						class="sub-float-mini
							{{if
								this.hasSub
								'has-sub'
							}}"
					>
						<ModuleHeader
							@id={{@id}}
							@variant="float"
							@clamped={{@clamped}}
						/>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}

export default class FloatLayer extends Component {
	pinned = new TrackedExternal(subscribePins, getPinned);
	docks = new TrackedExternal(subscribeDock, getModuleDockAll);
	positions = new TrackedExternal(subscribeDock, getFloatPosAll);
	clamps = new TrackedExternal(subscribeDock, getClampedAll);

	willDestroy() {
		super.willDestroy();
		this.pinned.unsubscribe();
		this.docks.unsubscribe();
		this.positions.unsubscribe();
		this.clamps.unsubscribe();
	}

	get floating(): {
		id: ModuleId;
		pos: { x: number; y: number };
		clamped: boolean;
	}[] {
		const docks = this.docks.current;
		const positions = this.positions.current;
		const clamps = this.clamps.current;
		const out: {
			id: ModuleId;
			pos: { x: number; y: number };
			clamped: boolean;
		}[] = [];
		for (const id of this.pinned.current) {
			const pos = positions[id];
			if (docks[id] === 'float' && pos) {
				out.push({ id, pos, clamped: clamps[id] });
			}
		}
		return out;
	}

	<template>
		{{#each this.floating key="id" as |f|}}
			<FloatPanel
				@id={{f.id}}
				@pos={{f.pos}}
				@clamped={{f.clamped}}
			/>
		{{/each}}
	</template>
}
