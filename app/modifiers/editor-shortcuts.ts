import { modifier } from 'ember-modifier';
import { fileOpen } from 'browser-fs-access';
import {
	getSnapshot,
	undo,
	redo,
} from 'delphitools-v2/lib/substrata/doc-store';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import { openScene, saveScene } from 'delphitools-v2/lib/substrata/file-ops';
import {
	deleteLayers,
	duplicateLayers,
	groupLayers,
	nudgeSelection,
	reorderLayers,
	ungroupLayer,
} from 'delphitools-v2/lib/substrata/layer-ops';
import { selectableLeafIds } from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getSelectedLayerIds,
	setSelection,
} from 'delphitools-v2/lib/substrata/selection';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import { getActiveTool } from 'delphitools-v2/lib/substrata/tool';
import { getToolSettings } from 'delphitools-v2/lib/substrata/tool-settings';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';

const ARROWS: Record<string, readonly [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

export default modifier(() => {
	const onKey = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement | null;
		if (
			target &&
			(target.isContentEditable ||
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT')
		) {
			return;
		}

		if (
			(e.key === 'Backspace' || e.key === 'Delete') &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey
		) {
			// prevent browser navigation
			e.preventDefault();
			deleteLayers(getSelectedLayerIds());
			return;
		}

		const arrow = ARROWS[e.key];
		if (
			arrow &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey &&
			getActiveTool() === 'move'
		) {
			e.preventDefault();
			const step =
				getToolSettings().move.nudge *
				(e.shiftKey ? 10 : 1);
			nudgeSelection(arrow[0] * step, arrow[1] * step);
			return;
		}

		if (!(e.metaKey || e.ctrlKey)) return;
		const key = e.key.toLowerCase();
		if (key === 'z') {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
		} else if (key === 'y') {
			e.preventDefault();
			redo();
		} else if (key === 's') {
			e.preventDefault();
			void saveScene(e.shiftKey);
		} else if (key === 'o') {
			e.preventDefault();
			void openScene();
		} else if (key === 'i') {
			e.preventDefault();
			void (async () => {
				try {
					const files = await fileOpen({
						mimeTypes: ['image/*'],
						multiple: true,
					});
					for (const f of Array.isArray(files)
						? files
						: [files])
						void importImageFile(f);
				} catch {
					// ignore picker cancellation
				}
			})();
		} else if (key === 'e') {
			e.preventDefault();
			openModal('export');
		} else if (key === 'a') {
			// prevent page selection
			e.preventDefault();
			const doc = getSnapshot();
			if (doc) setSelection(selectableLeafIds(doc.layers));
		} else if (key === 'd') {
			// prevent bookmark dialog
			e.preventDefault();
			duplicateLayers(getSelectedLayerIds());
		} else if (key === 'g') {
			e.preventDefault();
			if (e.shiftKey)
				getSelectedLayerIds().forEach(ungroupLayer);
			else groupLayers(getSelectedLayerIds());
		} else if (key === ']' || key === '}') {
			// support shifted brackets
			e.preventDefault();
			reorderLayers(
				getSelectedLayerIds(),
				e.shiftKey || key === '}' ? 'front' : 'forward',
			);
		} else if (key === '[' || key === '{') {
			e.preventDefault();
			reorderLayers(
				getSelectedLayerIds(),
				e.shiftKey || key === '{' ? 'back' : 'backward',
			);
		} else if (key === '0') {
			e.preventDefault();
			viewport.fit();
		} else if (key === '1') {
			e.preventDefault();
			viewport.setZoom(1);
		}
	};

	window.addEventListener('keydown', onKey);
	return () => window.removeEventListener('keydown', onKey);
});
