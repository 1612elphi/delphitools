// Copies the circle-flags language flags for Whisper's languages (the
// LANGUAGES table in app/lib/transcribe.ts) into public/flags, where the
// language combobox <img>s them. Re-run after a circle-flags version bump or
// a LANGUAGES change. Whisper's `jw` (Javanese) is `jv` in circle-flags;
// `sa` (Sanskrit) has no language flag, India's country flag stands in.
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
