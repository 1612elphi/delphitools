// One loader for pdf.js, shared by every tool that parses a PDF.
//
// The worker URL comes from the bundler. A worker copied into public/ pins a
// version of its own, and pdf.js refuses to run when it disagrees with the API
// by even a patch: "The API version 5.7.284 does not match the Worker version
// 5.4.624", thrown on the first PDF the tool opens rather than at build time.
// Resolving it through the package means an npm update moves both together.

import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type * as PdfJs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjs: Promise<typeof PdfJs> | null = null;

/** pdf.js is roughly a megabyte, so only a tool that opens a PDF loads it. */
export function getPdfJs(): Promise<typeof PdfJs> {
	pdfjs ??= import('pdfjs-dist').then((mod) => {
		mod.GlobalWorkerOptions.workerSrc = workerSrc;
		return mod;
	});
	return pdfjs;
}

// The directory the `pdfjs-wasm` Vite plugin serves the image-codec wasm from
// (see vite.config.mjs). getDocument must be handed this or pdf.js cannot decode
// JBIG2, JPEG2000 or CCITT images — a scanned PDF then renders its vector text
// but drops every scanned page image. Trailing slash required.
const PDF_WASM_URL = '/pdfjs-wasm/';

/**
 * Open a PDF with pdf.js, always wired to the image-codec wasm. Every tool that
 * renders or inspects PDF pages MUST go through this rather than calling
 * getDocument directly, or scanned documents lose their page images. `data` is
 * detached by pdf.js, so callers pass a throwaway copy (`bytes.slice(0)`).
 */
export async function loadPdfDocument(
	data: ArrayBuffer | Uint8Array,
): Promise<PDFDocumentProxy> {
	const pdfjs = await getPdfJs();
	return pdfjs.getDocument({ data, wasmUrl: PDF_WASM_URL }).promise;
}
