export const hint = (
	label: string,
): { 'aria-label': string; title: string } => ({
	'aria-label': label,
	title: label,
});
