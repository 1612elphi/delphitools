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

/**
 * Free-floating panels (round 3, Ruby 2026-07-12): an open module dragged out
 * of the rail lands here at an arbitrary canvas point. Idle floats render as
 * MINI cards — just the header row (title + live read-only summary + the
 * controls); hovering or keyboard-focusing one expands it to the full panel
 * in place, and the CLAMP toggle holds it full-size permanently. Positions
 * persist via dock-pref. Sits above the rail, below the omnibar.
 */

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

	// Deferred: focus/pointer boundary events fire synchronously during DOM
	// teardown (a focused child removed by the mini↔full swap), which lands
	// the write inside Glimmer's render and trips the backtracking assertion.
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
			{{! `shadow-lg` is a harness hook — the parent repo's rigs select on it }}
			<div class="sub-float-card shadow-lg">
				{{#if this.full}}
					<ModuleBox
						@id={{@id}}
						@variant="float"
						@clamped={{@clamped}}
					/>
				{{else}}
					{{! mini: the header row alone — title + live summary,
						read-only at a glance, tighter than the module's full
						width }}
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
