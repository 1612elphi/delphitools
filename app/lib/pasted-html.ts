// tags a plain-text copy never carries; editors that copy code send only div and span
const RICH = /<(h[1-6]|p|ul|ol|table|blockquote|a\s[^>]*href|strong|em|b|i)\b/i;

/**
 * The clipboard's `text/html` as an HTML fragment for conversion, or null
 * when it holds no formatting. Scripts, styles and images are removed.
 */
export function pastedHtml(html: string): string | null {
	if (!RICH.test(html)) return null;
	const body = new DOMParser().parseFromString(html, 'text/html').body;
	for (const node of body.querySelectorAll(
		'script, style, img, picture, svg, iframe, object, embed, meta, link',
	))
		node.remove();
	const comments = document.createNodeIterator(
		body,
		NodeFilter.SHOW_COMMENT,
	);
	for (let c = comments.nextNode(); c; c = comments.nextNode())
		(c as Comment).remove();
	const out = body.innerHTML.trim();
	return out && body.textContent?.trim() ? out : null;
}
