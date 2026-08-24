// missing css fails silently

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

// children carry the styling
const UNSTYLED_CONTAINERS = new Set([
	'dt-bc-rows',
	'dt-atlas-table',
	'dt-cc-table',
	'dt-docconv-option-text',
	'dt-shades-rows',
	'dt-tc-table',
	'dt-tabs',
	'sub-csm-section',
	'sub-grip', // draggable modifier handle
	'sub-preset-strip', // .segmented carries styling
	'sub-topbar-seg-hook', // span[title] rigs read
	'dt-ic-after-img', // bytes fetched off blob src
	'dt-ic-download', // disabled state read
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
	// else dt-sub-frame reads sub-
	for (const attr of source.matchAll(/class="([^"]*)"/g))
		for (const cls of attr[1].matchAll(
			/(?<![\w-])(?:dt|sub)-[a-z0-9-]+\b/g,
		))
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
