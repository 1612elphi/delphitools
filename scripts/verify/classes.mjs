// Every dt- class a component uses must be defined somewhere in the
// stylesheets. Guards against the failure mode where a bulk stylesheet edit
// swallows an unrelated rule block and the element silently falls back to UA
// default styling (the trimmer's transport buttons, 2026-08-11).
//
// Static check — needs no dev server. Usage: node scripts/verify/classes.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Wrapper names with deliberately no rules of their own; their children
// carry the styling. Additions here need a reason.
const UNSTYLED_CONTAINERS = new Set([
	'dt-bc-rows',
	'dt-atlas-table',
	'dt-cc-table',
	'dt-docconv-option-text',
	'dt-shades-rows',
	'dt-tc-table',
	'dt-tabs',
]);

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else yield path;
	}
}

let css = '';
for (const path of walk(join(root, 'app/styles')))
	if (/\.(scss|css)$/.test(path)) css += readFileSync(path, 'utf8');

const failures = [];
let checked = 0;

for (const path of walk(join(root, 'app/components'))) {
	if (!path.endsWith('.gts')) continue;
	const source = readFileSync(path, 'utf8');
	const used = new Set();
	for (const attr of source.matchAll(/class="([^"]*)"/g))
		for (const cls of attr[1].matchAll(/\bdt-[a-z0-9-]+\b/g))
			used.add(cls[0]);

	for (const cls of used) {
		checked++;
		if (UNSTYLED_CONTAINERS.has(cls)) continue;
		if (!css.includes(`.${cls}`))
			failures.push(
				`${path.slice(root.length + 1)}: .${cls} is used but defined nowhere in app/styles`,
			);
	}
}

if (failures.length) {
	for (const failure of failures) console.log(` FAIL  ${failure}`);
	console.log(`\nFAILURES: ${failures.length} of ${checked}`);
	process.exitCode = 1;
} else {
	console.log(`ALL PASS (${checked} class uses checked)`);
}
