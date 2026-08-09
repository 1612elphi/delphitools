// A static file server for the built output, shared by the prerender step and
// the verification rigs. Directory requests prefer that directory's own
// index.html, then the SPA shell, which is what makes a prerendered route and a
// client-side route both resolve.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';

export function serve(dir, port) {
	const types = {
		'.html': 'text/html',
		'.js': 'text/javascript',
		'.css': 'text/css',
		'.png': 'image/png',
		'.woff2': 'font/woff2',
		'.wasm': 'application/wasm',
		'.jpg': 'image/jpeg',
		'.svg': 'image/svg+xml',
		'.txt': 'text/plain',
	};
	const isFile = (p) => existsSync(p) && statSync(p).isFile();
	const server = createServer((req, res) => {
		const path = decodeURIComponent(req.url.split('?')[0]);
		const asked = join(dir, path);
		// A route directory exists once this script has written it, so a plain
		// existsSync would hand the browser a directory and throw EISDIR. Prefer
		// that directory's own index.html, then the SPA shell.
		const file = isFile(asked)
			? asked
			: isFile(join(asked, 'index.html'))
				? join(asked, 'index.html')
				: join(dir, 'index.html');
		const ext = file.slice(file.lastIndexOf('.'));
		res.writeHead(200, {
			'content-type':
				types[ext] ?? 'application/octet-stream',
		});
		res.end(readFileSync(file));
	});
	return new Promise((r) => server.listen(port, () => r(server)));
}
