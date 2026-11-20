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
// read: imports break node
const errataIcons = [
	...readFileSync(join(root, 'app/lib/errata/tool.ts'), 'utf8').matchAll(
		/icon: '([a-z0-9-]+)'/g,
	),
].map((m) => m[1]);

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
	// runtime names outside templates
	'alert-circle',
	'arrow-right-left',
	'axis-3d',
	'circle-check-big',
	'map-pin',
	'triangle-alert',
	// canon-docs passes via variables
	'panel-bottom',
	'panel-left',
	'panel-right',
	'panel-top',
	// colour ring canvas names
	'clock',
	'droplet',
	'hash',
	'highlighter',
	'pipette',
	'sliders-horizontal',
	'star',
	'swatch-book',
	...Object.values(FX_ICONS),
	...errataIcons,
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
	for (const m of src.matchAll(/@name=\{\{[^}]*\}\}/g)) {
		for (const s of m[0].matchAll(/["']([a-z0-9-]+)["']/g)) {
			candidates.add(s[1]);
		}
	}
	for (const m of src.matchAll(/\bicon:\s*["']([a-z0-9-]+)["']/g)) {
		candidates.add(m[1]);
	}
	for (const m of src.matchAll(/@icon=["']([a-z0-9-]+)["']/g)) {
		candidates.add(m[1]);
	}
	for (const m of src.matchAll(/IconSvg\s+name=["']([a-z0-9-]+)["']/g)) {
		candidates.add(m[1]);
	}
}

// lucide stand-ins until drawn
const STAND_IN = { substrata: 'brush', errata: 'signature' };
const lucideFile = (n) => STAND_IN[n] ?? n;
const lucide = (n) =>
	existsSync(
		join(
			root,
			'node_modules/lucide-static/icons',
			`${lucideFile(n)}.svg`,
		),
	);
const drawn = (n) => existsSync(join(root, 'app/icons', `${n}.svg`));
const isIcon = (n) => drawn(n) || lucide(n);

const names = [
	...new Set([
		...allTools.map((t) => t.icon),
		// @name not always icon
		...[...fromTemplates].filter(isIcon),
		...[...candidates].filter(isIcon),
		...EXTRA,
	]),
]
	.filter(Boolean)
	.sort();

const missing = names.filter((n) => !isIcon(n));
if (missing.length) {
	throw new Error(
		`not in app/icons or lucide-static: ${missing.join(', ')}`,
	);
}
const undrawn = names.filter((n) => !drawn(n));
if (undrawn.length) {
	console.warn(`UNDRAWN (lucide fallback): ${undrawn.join(', ')}`);
}

const ident = (n) =>
	'i' +
	n
		.split('-')
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join('');

const key = (n) => (/^[a-z][a-z\d]*$/.test(n) ? n : `'${n}'`);

const out = `${names.map((n) => `import ${ident(n)} from '${drawn(n) ? `../icons/${n}` : `lucide-static/icons/${lucideFile(n)}`}.svg?raw';`).join('\n')}

export const icons: Record<string, string> = {
${names.map((n) => `\t${key(n)}: ${ident(n)},`).join('\n')}
};
`;

writeFileSync(join(root, 'app/lib/icons.ts'), out);
console.log(`wrote app/lib/icons.ts — ${names.length} icons`);
