// sync whisper language flags
// jw maps to jv
// india flag for sa
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const src = new URL('../node_modules/circle-flags/flags/', import.meta.url);
const out = new URL('../public/flags/', import.meta.url);
const table = readFileSync(
	new URL('../app/lib/transcribe.ts', import.meta.url),
	'utf8',
);
const codes = [...table.matchAll(/\{ code: '([a-z]{2,3})', name: /g)].map(
	(m) => m[1],
);
const source = { jw: 'language/jv.svg', sa: 'in.svg' };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const code of codes) {
	copyFileSync(
		new URL(source[code] ?? `language/${code}.svg`, src),
		new URL(`${code}.svg`, out),
	);
}
console.log(`${codes.length} flags copied`);
