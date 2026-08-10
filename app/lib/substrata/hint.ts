/**
 * One string, both surfaces: icon-only controls need the same label as an
 * aria-label (screen readers) AND a title (the hover tooltip a mouse user
 * learns from — the clarity review's highest-leverage gap). Spread the result:
 * `<button {...hint("\u2211CG")}>` — one \u2211CG marker fills both.
 */
export const hint = (
	label: string,
): { 'aria-label': string; title: string } => ({
	'aria-label': label,
	title: label,
});
