import type * as Mupdf from 'mupdf';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import { sha256Hex } from 'delphitools-v2/lib/substrata/raster-cache';
import {
	openAta,
	saveAta,
	ATA_MIME,
} from 'delphitools-v2/lib/errata/write/ata';
import type { WriteDoc } from 'delphitools-v2/lib/errata/write/types';

const ATA_NAME = 'document.ata';
const META_NAME = 'errata.json';

// back-links would cycle
const UP = new Set(['P', 'Parent']);
// rewritten by garbage saves
const STREAM_KEYS = new Set(['Length', 'Filter', 'DecodeParms', 'DL']);

// object numbers change
function serialise(
	obj: Mupdf.PDFObject,
	out: (part: string | Uint8Array) => void,
	path: number[] = [],
	skip: Set<string> = UP,
): void {
	if (obj.isIndirect()) {
		const n = obj.asIndirect();
		const cycle = path.indexOf(n);
		if (cycle >= 0) return out(`@${path.length - cycle} `);
		path.push(n);
		if (obj.isStream()) {
			const bytes = obj.readStream().asUint8Array().slice();
			out(`stream ${bytes.length} `);
			out(bytes);
			serialise(
				obj.resolve(),
				out,
				path,
				new Set([...UP, ...STREAM_KEYS]),
			);
		} else serialise(obj.resolve(), out, path);
		path.pop();
		return;
	}
	if (obj.isArray()) {
		out('[');
		for (let i = 0; i < obj.length; i++)
			serialise(obj.get(i), out, path);
		out(']');
	} else if (obj.isDictionary()) {
		const entries: [string, Mupdf.PDFObject][] = [];
		obj.forEach((v, k) => {
			if (!skip.has(String(k))) entries.push([String(k), v]);
		});
		entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		out('<<');
		for (const [k, v] of entries) {
			out(`/${k} `);
			serialise(v, out, path);
		}
		out('>>');
	} else out(`${obj.toString(true)} `);
}

/** SHA-256 hex over every page's mediabox, content, resources, annotations and rotation. */
export async function pageChecksum(pdf: Mupdf.PDFDocument): Promise<string> {
	const parts: Uint8Array[] = [];
	const encoder = new TextEncoder();
	for (let i = 0; i < pdf.countPages(); i++) {
		const page = pdf.loadPage(i);
		// isStream needs indirect refs
		const contents = page.getObject().get('Contents');
		const streams = contents.isArray()
			? Array.from({ length: contents.length }, (_, j) =>
					contents.get(j),
				)
			: [contents];
		const bytes = streams
			.filter((s) => s.isStream())
			// copy off wasm heap
			.map((s) => s.readStream().asUint8Array().slice());
		parts.push(
			encoder.encode(
				`${page.getBounds('MediaBox').join(' ')}|${bytes.map((b) => b.length).join(' ')}|`,
			),
			...bytes,
		);
		const obj = page.getObject();
		const out = (part: string | Uint8Array) =>
			parts.push(
				typeof part === 'string'
					? encoder.encode(part)
					: part,
			);
		for (const key of ['Resources', 'Rotate']) {
			out(`|${key} `);
			serialise(obj.getInheritable(key), out);
		}
		out('|Annots ');
		serialise(obj.get('Annots'), out);
	}
	const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		all.set(p, at);
		at += p.length;
	}
	return sha256Hex(all.buffer);
}

/** Embeds the .ata and the page checksum; call after pages are final. Image bytes are stored twice, as PDF images and in the .ata (stored, not recompressed). */
export async function attachHybrid(
	pdf: Mupdf.PDFDocument,
	doc: WriteDoc,
): Promise<void> {
	const meta = JSON.stringify({
		v: 1,
		checksum: await pageChecksum(pdf),
	});
	const now = new Date();
	const embed = (name: string, mime: string, bytes: Uint8Array) =>
		pdf.insertEmbeddedFile(
			name,
			pdf.addEmbeddedFile(name, mime, bytes, now, now, true),
		);
	embed(ATA_NAME, ATA_MIME, saveAta(doc));
	embed(META_NAME, 'application/json', new TextEncoder().encode(meta));
}

/** The embedded document, or null when absent, invalid or the pages changed. */
export async function readHybrid(bytes: Uint8Array): Promise<WriteDoc | null> {
	try {
		const mupdf = await getMupdf();
		const pdf = mupdf.Document.openDocument(
			bytes,
			'application/pdf',
		).asPDF();
		if (!pdf) return null;
		const files = pdf.getEmbeddedFiles();
		if (!files[ATA_NAME] || !files[META_NAME]) return null;
		const meta = pdf.getEmbeddedFileContents(files[META_NAME]);
		const ata = pdf.getEmbeddedFileContents(files[ATA_NAME]);
		if (!meta || !ata) return null;
		const parsed = JSON.parse(meta.asString()) as unknown;
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			(parsed as { v?: unknown }).v !== 1 ||
			(parsed as { checksum?: unknown }).checksum !==
				(await pageChecksum(pdf))
		)
			return null;
		return openAta(ata.asUint8Array().slice());
	} catch {
		return null;
	}
}
