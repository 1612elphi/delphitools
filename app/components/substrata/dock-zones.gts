import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { pointerIntersection } from '@dnd-kit/collision';
import Icon from 'delphitools-v2/components/icon';
import droppable from 'delphitools-v2/modifiers/droppable';
import { dndManager } from 'delphitools-v2/lib/dnd';
import {
	getDockDrag,
	subscribeDockDrag,
} from 'delphitools-v2/lib/substrata/drag-dock';
import {
	getOmnibarEdge,
	subscribeDock,
	type Edge,
} from 'delphitools-v2/lib/substrata/dock-pref';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * Drop targets for drag-to-dock, on dnd-kit (round 3): a MODULE drag shows
 * only the rail strip (drop there to re-dock; drop ANYWHERE ELSE floats the
 * panel at the pointer — the canvas is the target now, so it gets no zone
 * chrome). An omnibar drag keeps its four edges. Zones render only while a
 * drag is live; collision is pointer intersection, so the pointer — not the
 * tiny grip rect — picks the target.
 *
 * Deviation from the Next component: no DragOverlay chip naming what's in
 * hand — @dnd-kit/dom's default feedback moves the grip element itself.
 */

type ZoneSpec = { id: string; icon: string; style: string };

/** Module-drag zone: just the rail strip hugging the omnibar's current edge. */
function moduleZones(omniEdge: Edge): ZoneSpec[] {
	const rail: Record<Edge, string> = {
		bottom: 'left: 128px; right: 128px; bottom: 8px; height: 80px',
		top: 'left: 128px; right: 128px; top: 8px; height: 80px',
		left: 'top: 128px; bottom: 128px; left: 112px; width: 80px',
		right: 'top: 128px; bottom: 128px; right: 112px; width: 80px',
	};
	return [{ id: 'rail', icon: 'dock', style: rail[omniEdge] }];
}

const OMNIBAR_ZONES: ZoneSpec[] = [
	{
		id: 'top',
		icon: 'panel-top',
		style: 'left: 112px; right: 112px; top: 8px; height: 80px',
	},
	{
		id: 'bottom',
		icon: 'panel-bottom',
		style: 'left: 112px; right: 112px; bottom: 8px; height: 80px',
	},
	{
		id: 'left',
		icon: 'panel-left',
		style: 'top: 8px; bottom: 8px; left: 8px; width: 80px',
	},
	{
		id: 'right',
		icon: 'panel-right',
		style: 'top: 8px; bottom: 8px; right: 8px; width: 80px',
	},
];

function zoneStyle(zone: ZoneSpec) {
	return htmlSafe(zone.style);
}

export default class DockZones extends Component {
	drag = new TrackedExternal(subscribeDockDrag, getDockDrag);
	omniEdge = new TrackedExternal(subscribeDock, getOmnibarEdge);

	// the useDroppable isOver equivalent, fed by the manager's drag events
	@tracked overId: string | null = null;

	#offOver = dndManager.monitor.addEventListener('dragover', (event) => {
		const id = event.operation.target?.id;
		this.overId = id === undefined ? null : String(id);
	});
	#offEnd = dndManager.monitor.addEventListener('dragend', () => {
		this.overId = null;
	});

	willDestroy() {
		super.willDestroy();
		this.drag.unsubscribe();
		this.omniEdge.unsubscribe();
		this.#offOver();
		this.#offEnd();
	}

	get zones(): ZoneSpec[] {
		const drag = this.drag.current;
		if (!drag) return [];
		return drag.kind === 'module'
			? moduleZones(this.omniEdge.current)
			: OMNIBAR_ZONES;
	}

	isOver = (id: string) => this.overId === id;

	pointerCollision = pointerIntersection;

	<template>
		{{#if this.drag.current}}
			<div aria-hidden="true" class="sub-dock-zones">
				{{#each this.zones key="id" as |z|}}
					<div
						data-dock-zone={{z.id}}
						class="sub-dock-zone
							{{if
								(this.isOver
									z.id
								)
								'is-over'
							}}"
						style={{zoneStyle z}}
						{{droppable
							id=z.id
							collision=this.pointerCollision
						}}
					>
						<Icon @name={{z.icon}} />
					</div>
				{{/each}}
			</div>
		{{/if}}
	</template>
}
