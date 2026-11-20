import {
	coverPage,
	insertField,
	insertNote,
	insertToc,
	run,
} from 'delphitools-v2/lib/errata/write/editor';
import { insertPageBreak } from 'delphitools-v2/lib/errata/write/model';
import { focusEditor, writePanel } from 'delphitools-v2/lib/errata/write/view';
import type { FieldKind, NoteRef } from 'delphitools-v2/lib/errata/write/types';

export const FIELDS: { kind: FieldKind; text: string }[] = [
	{ kind: 'page', text: 'Page number' },
	{ kind: 'pages', text: 'Page count' },
	{ kind: 'date', text: 'Date' },
	{ kind: 'title', text: 'Title' },
	{ kind: 'section', text: 'Section' },
];

export const inserts = {
	cover: () => {
		coverPage();
		focusEditor();
	},
	pageBreak: () => {
		run((d, s) => insertPageBreak(d, s));
		focusEditor();
	},
	note: (kind: NoteRef['kind']) => {
		insertNote(kind);
		focusEditor();
	},
	contents: () => {
		insertToc();
		focusEditor();
	},
	numbers: () => writePanel.set('numbers'),
	field: (kind: FieldKind) => {
		insertField(kind);
		focusEditor();
	},
};
