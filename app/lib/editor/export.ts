import { DOMSerializer } from 'prosemirror-model';
import type { Node as PMNode } from 'prosemirror-model';
import { downloadText } from 'delphitools-v2/lib/download';
import { schema } from './schema';
import { serializeDoc } from './markdown';

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

function printHtmlInIframe(html: string): void {
	const iframe = document.createElement('iframe');
	iframe.setAttribute('aria-hidden', 'true');
	// sandbox disables document scripts
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
