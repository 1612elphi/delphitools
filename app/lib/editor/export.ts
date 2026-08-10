// Exports derived from the live editor doc. Markdown is canonical; HTML is
// rendered via DOMSerializer so it matches the on-screen rendering exactly.
// The download and print-to-PDF helpers are inlined from the Next app's
// lib/download.ts and lib/print-pdf.ts; the editor is their only v2 user so far.
import { DOMSerializer } from 'prosemirror-model';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from './schema';
import { serializeDoc } from './markdown';

function downloadText(text: string, filename: string, mimeType: string): void {
	const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	// Revoke on the next tick so the navigation/download has started.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

// A clean print stylesheet injected into the document we hand to the print engine.
const PRINT_CSS = `
@page { margin: 2cm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { font-size: 12pt; }
body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #111; margin: 0; }
h1, h2, h3, h4 { line-height: 1.25; page-break-after: avoid; }
h1 { font-size: 1.9em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; }
p, li { orphans: 3; widows: 3; }
pre, code, kbd { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
pre { background: #f5f5f5; padding: 0.75em 1em; border-radius: 6px; overflow-wrap: break-word; white-space: pre-wrap; }
code { background: #f5f5f5; padding: 0.1em 0.3em; border-radius: 4px; font-size: 0.9em; }
pre code { background: none; padding: 0; }
blockquote { margin: 0; padding-left: 1em; border-left: 3px solid #ddd; color: #555; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; text-align: left; }
img { max-width: 100%; }
a { color: #0645ad; text-decoration: none; }
`;

function injectPrintStyles(html: string): string {
	const style = `<style>${PRINT_CSS}</style>`;
	return html.includes('</head>')
		? html.replace('</head>', `${style}</head>`)
		: `${style}${html}`;
}

/** Render HTML in an offscreen iframe and invoke the browser's print-to-PDF. */
function printHtmlInIframe(html: string): void {
	const iframe = document.createElement('iframe');
	iframe.setAttribute('aria-hidden', 'true');
	// Sandbox the print frame: allow-same-origin lets us drive win.print() and
	// allow-modals permits the print dialog, but the absence of allow-scripts
	// means any <script>/onerror/onload smuggled in via converted documents
	// cannot execute in our origin. Carried from the Next app's security audit.
	iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
	iframe.style.cssText =
		'position:fixed; left:-9999px; top:0; width:794px; height:0; border:0;';
	iframe.srcdoc = html;
	iframe.onload = () => {
		const win = iframe.contentWindow;
		if (!win) return;
		win.addEventListener('afterprint', () =>
			setTimeout(() => iframe.remove(), 300),
		);
		win.focus();
		win.print();
		setTimeout(
			() => document.body.contains(iframe) && iframe.remove(),
			60_000,
		);
	};
	document.body.appendChild(iframe);
}

function docToBodyHtml(doc: PMNode): string {
	const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
		doc.content,
	);
	const div = document.createElement('div');
	div.appendChild(fragment);
	return div.innerHTML;
}

function standaloneHtml(bodyHtml: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>Document</title></head><body>${bodyHtml}</body></html>`;
}

export function exportMarkdown(doc: PMNode): void {
	downloadText(
		serializeDoc(doc),
		'document.md',
		'text/markdown;charset=utf-8',
	);
}

export function exportHtml(doc: PMNode): void {
	const html = injectPrintStyles(standaloneHtml(docToBodyHtml(doc)));
	downloadText(html, 'document.html', 'text/html;charset=utf-8');
}

export async function copyRichText(doc: PMNode): Promise<void> {
	const html = standaloneHtml(docToBodyHtml(doc));
	const markdown = serializeDoc(doc);
	await navigator.clipboard.write([
		new ClipboardItem({
			'text/html': new Blob([html], { type: 'text/html' }),
			'text/plain': new Blob([markdown], {
				type: 'text/plain',
			}),
		}),
	]);
}

export function exportPdf(doc: PMNode): void {
	printHtmlInIframe(
		injectPrintStyles(standaloneHtml(docToBodyHtml(doc))),
	);
}
