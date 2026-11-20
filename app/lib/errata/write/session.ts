import { downloadBlob } from 'delphitools-v2/lib/download';
import { openPdf } from 'delphitools-v2/lib/errata/source';
import { currentLayout, ensureDocFonts } from './editor';
import { ATA_MIME, openAta, saveAta } from './ata';
import { readHybrid } from './hybrid';
import { stopMarkup } from './markup';
import { applySuggestedHeadings, newDoc } from './model';
import { byteString, docToRtf, rtfToDoc } from './rtf';
import { exportWritePdf } from './pdf';
import { writeStore } from './store';
import type { WriteDoc } from './types';

export const isAta = (file: File) => /\.ata$/i.test(file.name);

export function newDocument(): void {
	writeStore.open(newDoc('Untitled'));
}

export const isRtf = (file: File) => /\.rtf$/i.test(file.name);

export async function openRtfFile(file: File): Promise<void> {
	const text = byteString(new Uint8Array(await file.arrayBuffer()));
	const name = file.name.replace(/\.rtf$/i, '');
	const doc = applySuggestedHeadings(rtfToDoc(text, name));
	await ensureDocFonts(doc);
	writeStore.open(doc);
}

export function rtfText(): string | null {
	const s = writeStore.get();
	return s ? docToRtf(s.doc, currentLayout(s.doc)?.labels) : null;
}

export function exportRtf(): void {
	const s = writeStore.get();
	const text = rtfText();
	if (!s || text === null) return;
	downloadBlob(
		new Blob([text], { type: 'application/rtf' }),
		`${base(s.doc)}.rtf`,
	);
}

export async function openAtaFile(file: File): Promise<void> {
	const doc = openAta(new Uint8Array(await file.arrayBuffer()));
	await ensureDocFonts(doc);
	writeStore.open(doc);
}

/** true when the PDF was an untouched errata export */
export async function openHybrid(file: File): Promise<boolean> {
	const doc = await readHybrid(new Uint8Array(await file.arrayBuffer()));
	if (!doc) return false;
	await ensureDocFonts(doc);
	writeStore.open(doc);
	return true;
}

const base = (doc: WriteDoc) =>
	doc.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Untitled';

/** The open document as hybrid PDF bytes; null when nothing is open. */
export async function pdfBytes(): Promise<Uint8Array | null> {
	const s = writeStore.get();
	if (!s) return null;
	await ensureDocFonts(s.doc);
	const layout = currentLayout(s.doc);
	return layout ? exportWritePdf(s.doc, layout) : null;
}

export function ataBytes(): Uint8Array | null {
	const s = writeStore.get();
	return s ? saveAta(s.doc) : null;
}

// null: none or failed
async function pdfFile(): Promise<File | null> {
	const s = writeStore.get();
	const bytes = await pdfBytes().catch(() => null);
	return s && bytes
		? new File([bytes as BlobPart], `${base(s.doc)}.pdf`, {
				type: 'application/pdf',
			})
		: null;
}

/** false when the export failed */
export async function exportWrite(): Promise<boolean> {
	const file = await pdfFile();
	if (file) downloadBlob(file, file.name);
	return !!file;
}

/** Downloads the export, which reopens as the written document, then opens it in PDF mode, which closes the written document; false when the export failed or `cancelled` says so once the export is built. */
export async function continueAsPdf(
	cancelled: () => boolean,
): Promise<boolean> {
	const file = await pdfFile();
	if (!file || cancelled()) return false;
	downloadBlob(file, file.name);
	stopMarkup();
	await openPdf(file);
	return true;
}

export function saveWrite(): void {
	const s = writeStore.get();
	const bytes = ataBytes();
	if (!s || !bytes) return;
	downloadBlob(
		new Blob([bytes as BlobPart], { type: ATA_MIME }),
		`${base(s.doc)}.ata`,
	);
}

export const isPdf = (file: File) =>
	file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Opens .ata, .rtf or a hybrid PDF; false for any other file, a plain PDF among them. */
export async function openWriteFile(file: File): Promise<boolean> {
	if (isAta(file)) await openAtaFile(file);
	else if (isRtf(file)) await openRtfFile(file);
	else return isPdf(file) && openHybrid(file);
	return true;
}
