import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public/substrata/templates');
const THUMBS = ['.webp', '.png', '.jpg'];

const entries = readdirSync(dir)
	.filter((f) => f.endsWith('.substrata'))
	.sort()
	.map((file) => {
		const zip = unzipSync(readFileSync(join(dir, file)), {
			filter: (f) => f.name === 'manifest.json',
		});
		const { doc } = JSON.parse(strFromU8(zip['manifest.json']));
		const base = file.slice(0, -'.substrata'.length);
		const thumb =
			THUMBS.map((ext) => base + ext).find((t) =>
				existsSync(join(dir, t)),
			) ?? null;
		const { width, height } = doc.artboard;
		return { file, name: doc.name || base, thumb, width, height };
	});

writeFileSync(
	join(dir, 'index.json'),
	JSON.stringify(entries, null, '\t') + '\n',
);
console.log(`${entries.length} templates`);
