// prefer route indexes

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
