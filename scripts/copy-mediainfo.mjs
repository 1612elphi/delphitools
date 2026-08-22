// Copies the mediainfo.js emscripten bundle (ESM glue + 2.5 MB wasm) into
// public/mediainfo, where lib/mediainfo.ts imports it at runtime outside the
// Vite graph (the jxl/mupdf idiom). Re-run after a mediainfo.js version bump.
import { copyFileSync, mkdirSync } from 'node:fs';

const src = new URL('../node_modules/mediainfo.js/', import.meta.url);
const out = new URL('../public/mediainfo/', import.meta.url);
mkdirSync(out, { recursive: true });
copyFileSync(
	new URL('dist/esm-bundle/index.min.js', src),
	new URL('mediainfo.min.js', out),
);
copyFileSync(
	new URL('dist/MediaInfoModule.wasm', src),
	new URL('MediaInfoModule.wasm', out),
);
copyFileSync(
	new URL('LICENSE.txt', src),
	new URL('LICENSE.mediainfo.txt', out),
);
