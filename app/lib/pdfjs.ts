// One loader for pdf.js, shared by every tool that parses a PDF.
//
// The worker URL comes from the bundler. A worker copied into public/ pins a
// version of its own, and pdf.js refuses to run when it disagrees with the API
// by even a patch: "The API version 5.7.284 does not match the Worker version
// 5.4.624", thrown on the first PDF the tool opens rather than at build time.
// Resolving it through the package means an npm update moves both together.

import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type * as PdfJs from 'pdfjs-dist';

let pdfjs: Promise<typeof PdfJs> | null = null;

/** pdf.js is roughly a megabyte, so only a tool that opens a PDF loads it. */
export function getPdfJs(): Promise<typeof PdfJs> {
	pdfjs ??= import('pdfjs-dist').then((mod) => {
		mod.GlobalWorkerOptions.workerSrc = workerSrc;
		return mod;
	});
	return pdfjs;
}
