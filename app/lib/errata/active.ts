import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
import { closeDoc } from 'delphitools-v2/lib/errata/source';
import { store } from 'delphitools-v2/lib/errata/store';
import { exportWrite } from 'delphitools-v2/lib/errata/write/session';
import { markup } from 'delphitools-v2/lib/errata/write/markup';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { fitPage, writeView } from 'delphitools-v2/lib/errata/write/view';
import {
	getZoom,
	subscribeViewport,
	viewport,
} from 'delphitools-v2/lib/substrata/viewport';

/** The open document, PDF or written, as the shell and menu use it. */
export interface ActiveDoc {
	kind: 'pdf' | 'write';
	subscribe: (listener: () => void) => () => void;
	title: () => string;
	/** absent: the name is fixed */
	rename?: (name: string) => void;
	zoom: () => number;
	fit: () => void;
	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
	/** false when the export failed */
	exportFile: () => Promise<boolean>;
	close: () => void;
}

const both =
	(...subs: ((listener: () => void) => () => void)[]) =>
	(listener: () => void) => {
		const offs = subs.map((s) => s(listener));
		return () => offs.forEach((off) => off());
	};

const pdfDoc: ActiveDoc = {
	kind: 'pdf',
	subscribe: both(store.subscribe, subscribeViewport),
	title: () => store.getSnapshot()?.name ?? '',
	zoom: getZoom,
	fit: () => viewport.fit(),
	undo: () => store.undo(),
	redo: () => store.redo(),
	canUndo: () => store.canUndo(),
	canRedo: () => store.canRedo(),
	exportFile: () => exportCurrent(),
	close: closeDoc,
};

const writeDoc: ActiveDoc = {
	kind: 'write',
	subscribe: both(writeStore.subscribe, writeView.subscribe),
	title: () => writeStore.get()?.doc.name ?? '',
	rename: (name) => {
		const s = writeStore.get();
		if (s && name !== s.doc.name)
			writeStore.commit(
				{ doc: { ...s.doc, name }, sel: s.sel },
				'other',
			);
	},
	zoom: () => writeView.get().zoom,
	fit: fitPage,
	undo: writeStore.undo,
	redo: writeStore.redo,
	canUndo: writeStore.canUndo,
	canRedo: writeStore.canRedo,
	exportFile: exportWrite,
	close: writeStore.close,
};

/** Fires on any change to either kind of document. */
export const subscribeActive = both(pdfDoc.subscribe, writeDoc.subscribe);

export function activeDoc(): ActiveDoc | null {
	if (writeStore.get()) return writeDoc;
	return store.getSnapshot() ? pdfDoc : null;
}

// opening one kind closes the other
writeStore.subscribe(() => {
	if (writeStore.get() && store.getSnapshot() && !markup.get())
		closeDoc();
});
store.subscribe(() => {
	if (store.getSnapshot() && writeStore.get() && !markup.get())
		writeStore.close();
});
