// A dynamic import Vite never sees. A literal specifier for a /public module
// is resolved by Rolldown and fails with UNRESOLVED_IMPORT; a variable one is
// rewritten by the dev server to `?import` and transformed as an ES module,
// which breaks emscripten glue. Building the import through `new Function`
// keeps it out of both, so dev and production take the same path. Every
// caller passes a constant URL; nothing reaches this from user input.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
export const rawImport = new Function('u', 'return import(u)') as <T>(
	url: string,
) => Promise<T>;
