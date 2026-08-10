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

/**
 * Substrata keyboard map. ⌘/Ctrl+Z = undo, ⌘/Ctrl+Shift+Z or Ctrl+Y = redo.
 * Backspace/Delete removes the selected layers (same path as the layers-panel
 * footer; one undo step). Arrow keys nudge the selection while MOVE is the
 * active tool (step = the MOVE settings' nudge value, ⇧ ×10; one undo step per
 * press). ⌘A selects what a marquee could grab (visible + unlocked leaves) —
 * never the page text. ⌘D duplicate · ⌘G/⇧⌘G group/ungroup · ⌘]/⌘[ restack
 * (⇧ to the ends) · ⌘E export · ⌘0 fit / ⌘1 100%. Ignored while typing in a
 * field. Mounted by the editor shell; the menus call the same actions and
 * hint these combos. The layer ops validate internally, so a combo on an
 * ineligible selection is a clean no-op.
 */

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
			// Backspace must never trigger browser back-navigation
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
			// ⌘S save · ⇧⌘S save a copy (M5 — matches the Scene menu hints)
			e.preventDefault();
			void saveScene(e.shiftKey);
		} else if (key === 'o') {
			e.preventDefault();
			void openScene();
		} else if (key === 'i') {
			// ⌘I import — the Scene-menu hint promised this; deliver it
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
					// picker dismissed
				}
			})();
		} else if (key === 'e') {
			// ⌘E export — the Scene-menu hint promised this too
			e.preventDefault();
			openModal('export');
		} else if (key === 'a') {
			e.preventDefault(); // never the browser's select-all-page-text
			const doc = getSnapshot();
			if (doc) setSelection(selectableLeafIds(doc.layers));
		} else if (key === 'd') {
			e.preventDefault(); // and never the browser's bookmark dialog
			duplicateLayers(getSelectedLayerIds());
		} else if (key === 'g') {
			e.preventDefault();
			if (e.shiftKey)
				getSelectedLayerIds().forEach(ungroupLayer);
			else groupLayers(getSelectedLayerIds());
		} else if (key === ']' || key === '}') {
			// ⇧ turns ] into } on most layouts — treat both as the shifted
			// combo
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
