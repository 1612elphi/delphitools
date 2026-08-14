// Runs every rig in this directory against a dev server and reports the tally.
//
// Three rigs are excluded. static.mjs drives the built output rather than the
// dev server and needs `npm run build:static` first. bg-removal.mjs downloads
// roughly 44 MB of model weights and runs inference, and pdf-compressor.mjs
// downloads the ~10 MB MuPDF wasm on its first compress. Each has its own npm
// script.
//
// Usage: npm start in one shell, then npm run verify.

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { BASE } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set([
	'all.mjs',
	'harness.mjs',
	'static.mjs',
	'bg-removal.mjs',
	'pdf-compressor.mjs',
]);

const rigs = readdirSync(here)
	.filter((name) => name.endsWith('.mjs') && !SKIP.has(name))
	.sort();

const reachable = await new Promise((resolve) => {
	const req = get(BASE, (res) => {
		res.resume();
		resolve(res.statusCode === 200);
	});
	req.on('error', () => resolve(false));
	req.setTimeout(3000, () => {
		req.destroy();
		resolve(false);
	});
});
if (!reachable) {
	console.log(`no dev server at ${BASE} — run npm start first`);
	process.exitCode = 1;
} else {
	console.log(`${rigs.length} rigs against ${BASE}\n`);

	const failed = [];
	for (const rig of rigs) {
		const code = await run(join(here, rig));
		const tally = code === 0 ? 'pass' : 'FAIL';
		console.log(`${tally}  ${rig}`);
		if (code !== 0) failed.push(rig);
	}

	console.log('');
	if (failed.length) {
		console.log(
			`FAILURES in ${failed.length} of ${rigs.length}: ${failed.join(', ')}`,
		);
		console.log(
			'Re-run one on its own to see which checks failed.',
		);
		process.exitCode = 1;
	} else {
		console.log(`ALL PASS (${rigs.length} rigs)`);
	}
}

/** Output is buffered and only printed on failure, so a green run stays quiet. */
function run(path) {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [path], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		child.stdout.on('data', (d) => (output += d));
		child.stderr.on('data', (d) => (output += d));
		child.on('close', (code) => {
			if (code !== 0) console.log(output);
			resolve(code);
		});
	});
}
