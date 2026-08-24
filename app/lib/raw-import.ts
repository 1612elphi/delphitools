// hide import from bundlers
// eslint-disable-next-line @typescript-eslint/no-implied-eval
export const rawImport = new Function('u', 'return import(u)') as <T>(
	url: string,
) => Promise<T>;
