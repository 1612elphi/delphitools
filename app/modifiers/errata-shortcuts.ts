import { modifier } from 'ember-modifier';
import {
	getPageIndex,
	setPageIndex,
	store,
} from 'delphitools-v2/lib/errata/store';
import { TOOL_ORDER, activeTool } from 'delphitools-v2/lib/errata/tool';
import {
	boxMode,
	closeMode,
	deleteSelection,
	dismissTop,
	modal,
	modeKey,
	pickImageFile,
	setMode,
	toolbox,
} from 'delphitools-v2/lib/errata/ui';
import { markup, stopMarkup } from 'delphitools-v2/lib/errata/write/markup';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { isTextEntry } from 'delphitools-v2/lib/text-entry';

export default modifier(() => {
	// fabric drags skip transients
	let pressed = false;
	const press = (e: PointerEvent) => {
		pressed = e.type === 'pointerdown';
	};
	const onKey = (e: KeyboardEvent) => {
		const mod = e.metaKey || e.ctrlKey;
		const escape = e.key === 'Escape' && !mod && !e.altKey;
		if (escape && dismissTop()) return;
		if (isTextEntry(e.target)) {
			if (escape) (e.target as HTMLElement).blur();
			return;
		}
		const marking = markup.get();
		if (writeStore.get() && !marking) return;
		if (modeKey(e)) {
			e.preventDefault();
			return;
		}

		if (!mod && !e.altKey) {
			if (e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault();
				deleteSelection();
				return;
			}
			if (escape) {
				if (marking && !boxMode.get()) stopMarkup();
				else if (toolbox.get()) toolbox.set(false);
				else if (boxMode.get()) closeMode();
				else activeTool.set('select');
				return;
			}
			if (marking) return;
			// mode bar blocks tools
			if (boxMode.get() && /^[a-z]$/i.test(e.key)) return;
			if (e.key.toLowerCase() === 'c') {
				toolbox.set(false);
				setMode('crop');
				return;
			}
			if (e.key === 'PageDown' || e.key === ']') {
				setPageIndex(getPageIndex() + 1);
				return;
			}
			if (e.key === 'PageUp' || e.key === '[') {
				setPageIndex(getPageIndex() - 1);
				return;
			}
			const key = e.key.toLowerCase();
			const tool = TOOL_ORDER.find(
				(t) => t.key.toLowerCase() === key,
			);
			if (tool) {
				if (tool.id === 'signature')
					modal.set('signature');
				else if (tool.id === 'image') pickImageFile();
				else activeTool.set(tool.id);
				return;
			}
		}
		if (!mod) return;
		const key = e.key.toLowerCase();
		if (key === 'z') {
			e.preventDefault();
			if (pressed) return;
			const history = marking ? writeStore : store;
			if (e.shiftKey) history.redo();
			else history.undo();
		} else if (key === '=' || key === '+') {
			e.preventDefault();
			viewport.zoomIn();
		} else if (key === '-') {
			e.preventDefault();
			viewport.zoomOut();
		} else if (key === '0') {
			e.preventDefault();
			viewport.fit();
		}
	};
	const events = ['pointerdown', 'pointerup', 'pointercancel'] as const;
	window.addEventListener('keydown', onKey);
	for (const t of events) window.addEventListener(t, press, true);
	return () => {
		window.removeEventListener('keydown', onKey);
		for (const t of events)
			window.removeEventListener(t, press, true);
	};
});
