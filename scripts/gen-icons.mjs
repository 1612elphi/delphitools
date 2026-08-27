import {
	readFileSync,
	writeFileSync,
	existsSync,
	readdirSync,
	statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { allTools } = await import('../app/lib/tools.ts');
const { FX_ICONS, FX_ICON_FALLBACK } =
	await import('../app/lib/substrata/fx-icons.ts');

// runtime icon names
const EXTRA = [
	'clipboard-x',
	'lock-open',
	'pin',
	'pin-off',
	// position picker icon
	'arrow-up-left',
	'arrow-up',
	'arrow-up-right',
	'arrow-left',
	'dot',
	'arrow-right',
	'arrow-down-left',
	'arrow-down',
	'arrow-down-right',
	// recipe table block palette
	'folder',
	'cooking-pot',
	'carrot',
	'list-checks',
	'settings-2',
	...Object.values(FX_ICONS),
	FX_ICON_FALLBACK,
];

function walk(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const p = join(dir, entry);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

const fromTemplates = new Set();
const candidates = new Set();
for (const file of walk(join(root, 'app')).filter((f) => f.endsWith('.gts'))) {
	const src = readFileSync(file, 'utf8');
	for (const m of src.matchAll(/@name=["']([a-z0-9-]+)["']/g)) {
		fromTemplates.add(m[1]);
	}
	// collect expression string candidates
	for (const m of src.matchAll(/@name=\{\{[^}]*\}\}/g)) {
		for (const s of m[0].matchAll(/["']([a-z0-9-]+)["']/g)) {
			candidates.add(s[1]);
		}
	}
	// collect data icon candidates
	for (const m of src.matchAll(/\bicon:\s*["']([a-z0-9-]+)["']/g)) {
		candidates.add(m[1]);
	}
	for (const m of src.matchAll(/@icon=["']([a-z0-9-]+)["']/g)) {
		candidates.add(m[1]);
	}
}

const isIcon = (n) =>
	existsSync(join(root, 'node_modules/lucide-static/icons', `${n}.svg`));

const names = [
	...new Set([
		...allTools.map((t) => t.icon),
		...fromTemplates,
		...[...candidates].filter(isIcon),
		...EXTRA,
	]),
]
	.filter(Boolean)
	.sort();

const missing = names.filter((n) => !isIcon(n));
if (missing.length) {
	throw new Error(`not in lucide-static: ${missing.join(', ')}`);
}

const ident = (n) =>
	'i' +
	n
		.split('-')
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join('');

const key = (n) => (/^[a-z][a-z\d]*$/.test(n) ? n : `'${n}'`);

const out = `${names.map((n) => `import ${ident(n)} from 'lucide-static/icons/${n}.svg?raw';`).join('\n')}

export const icons: Record<string, string> = {
${names.map((n) => `\t${key(n)}: ${ident(n)},`).join('\n')}
};
`;

writeFileSync(join(root, 'app/lib/icons.ts'), out);
console.log(`wrote app/lib/icons.ts — ${names.length} icons`);
