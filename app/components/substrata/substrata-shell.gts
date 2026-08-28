import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import FabricCanvas from 'delphitools-v2/components/substrata/fabric-canvas';
import TopBar from 'delphitools-v2/components/substrata/top-bar';
import Omnibar from 'delphitools-v2/components/substrata/omnibar/omnibar';
import ModalHost from 'delphitools-v2/components/substrata/modal-host';
import { LayerContextMenu } from 'delphitools-v2/components/substrata/layer-context-menu';
import SelectionPopup from 'delphitools-v2/components/substrata/selection-popup';
import SecureContextNotice from 'delphitools-v2/components/substrata/secure-context-notice';
import EmptyHint from 'delphitools-v2/components/substrata/empty-hint';
import SmallScreenNotice from 'delphitools-v2/components/substrata/small-screen-notice';
import DockZones from 'delphitools-v2/components/substrata/dock-zones';
import FloatLayer from 'delphitools-v2/components/substrata/float-layer';
import editorShortcuts from 'delphitools-v2/modifiers/editor-shortcuts';
import { dndManager } from 'delphitools-v2/lib/dnd';
import {
	dockToRail,
	floatModule,
	hydrateLayoutPrefs,
	setOmnibarEdge,
	type Edge,
} from 'delphitools-v2/lib/substrata/dock-pref';
import { setPinned } from 'delphitools-v2/lib/substrata/pin-pref';
import {
	endDockDrag,
	startDockDrag,
	type DockDrag,
} from 'delphitools-v2/lib/substrata/drag-dock';

const EDGES: ReadonlySet<string> = new Set(['top', 'bottom', 'left', 'right']);

export default class SubstrataShell extends Component {
	mount = modifier((root: HTMLElement) => {
		hydrateLayoutPrefs();

		const offStart = dndManager.monitor.addEventListener(
			'dragstart',
			(e) => {
				const drag = e.operation.source?.data as
					DockDrag | undefined;
				if (drag) startDockDrag(drag);
			},
		);

		const offEnd = dndManager.monitor.addEventListener(
			'dragend',
			(e) => {
				const drag = e.operation.source?.data as
					DockDrag | undefined;
				const target = e.operation.target?.id;
				const over =
					target === undefined
						? undefined
						: String(target);
				if (drag && !e.canceled) {
					if (drag.kind === 'module') {
						if (over === 'rail') {
							dockToRail(drag.id);
							setPinned(
								drag.id,
								true,
							);
						} else {
							const area =
								root.querySelector(
									'.sub-shell-canvas-area',
								);
							const rect =
								area?.getBoundingClientRect();
							const pos =
								e.operation
									.position
									.current;
							if (rect) {
								const x =
									pos.x -
									rect.left -
									10;
								const y =
									pos.y -
									rect.top -
									10;
								floatModule(
									drag.id,
									{
										x: Math.max(
											0,
											Math.min(
												x,
												rect.width -
													120,
											),
										),
										y: Math.max(
											0,
											Math.min(
												y,
												rect.height -
													40,
											),
										),
									},
								);
								setPinned(
									drag.id,
									true,
								);
							}
						}
					} else if (
						over !== undefined &&
						EDGES.has(over)
					) {
						setOmnibarEdge(over as Edge);
					}
				}
				endDockDrag();
			},
		);

		return () => {
			offStart();
			offEnd();
		};
	});

	<template>
		<div class="sub-shell" {{this.mount}} {{editorShortcuts}}>
			<TopBar />
			<SecureContextNotice />
			<div class="sub-shell-body">
				<div class="sub-shell-canvas-area">
					<FabricCanvas />
					<Omnibar />
					<FloatLayer />
					<SelectionPopup />
					<EmptyHint />
					<DockZones />
				</div>
			</div>
			<ModalHost />
			<LayerContextMenu />
			<SmallScreenNotice />
		</div>
	</template>
}
