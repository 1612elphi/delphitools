import { channel } from 'delphitools-v2/lib/channel';

export interface WriteViewState {
	zoom: number;
	fitZoom: number;
	/** shows a whole page */
	pageZoom: number;
	/** user zoom wins over fit */
	zoomed: boolean;
	/** zoom follows pageZoom */
	paged: boolean;
}

export const writeView = channel<WriteViewState>(
	{ zoom: 1, fitZoom: 1, pageZoom: 1, zoomed: false, paged: false },
	(a, b) =>
		a.zoom === b.zoom &&
		a.fitZoom === b.fitZoom &&
		a.pageZoom === b.pageZoom &&
		a.zoomed === b.zoomed &&
		a.paged === b.paged,
);

function fitZoom() {
	const v = writeView.get();
	writeView.set({ ...v, zoom: v.fitZoom, zoomed: false, paged: false });
}

/** Shows a whole page; a second call returns to the width fit. */
export function fitPage() {
	const v = writeView.get();
	if (v.paged) fitZoom();
	else
		writeView.set({
			...v,
			zoom: v.pageZoom,
			zoomed: true,
			paged: true,
		});
}

/** Multiplies the zoom, kept between half the fit zoom and 4. */
export function zoomBy(factor: number) {
	const v = writeView.get();
	const zoom = Math.min(4, Math.max(v.fitZoom / 2, v.zoom * factor));
	writeView.set({ ...v, zoom, zoomed: true, paged: false });
}

let focusInput: (() => void) | null = null;

export function registerFocus(fn: (() => void) | null) {
	focusInput = fn;
}

/** Returns focus to the write input. */
export const focusEditor = () => focusInput?.();

let openTab: ((id: string) => void) | null = null;

export function registerTabs(fn: ((id: string) => void) | null) {
	openTab = fn;
}

/** Opens a layout tab above the pages; false when the tabs are not shown. */
export function showTab(id: string): boolean {
	openTab?.(id);
	return !!openTab;
}

let shownPage: (() => number) | null = null;

export function registerShownPage(fn: (() => number) | null) {
	shownPage = fn;
}

/** The page index the write view shows, 0 when it is not mounted. */
export const visiblePage = () => shownPage?.() ?? 0;

export type WritePanel = 'setup' | 'numbers' | 'find' | 'link';

/** the tool panel in the format bar's place */
export const writePanel = channel<WritePanel | null>(null);

/** A TrackedExternal reader: true while panel id is open. */
export const isPanel = (id: WritePanel) => () => writePanel.get() === id;

export function closePanel() {
	writePanel.set(null);
	focusEditor();
}

export const railTab = channel<'pages' | 'outline'>('pages');
