// client-only fabric import

import {
	config,
	getFilterBackend,
	setFilterBackend,
	WebGLFilterBackend,
	Canvas2dFilterBackend,
} from 'fabric';
import { workingRasterCap } from './webgl-limits';

let installed = false;

export function initSubstrataFilterBackend(): void {
	if (installed || typeof document === 'undefined') return;
	installed = true;

	// prevent fabric texture cropping
	config.textureSize = workingRasterCap();

	try {
		const backend = getFilterBackend(false);
		if (backend instanceof WebGLFilterBackend && backend.canvas) {
			backend.canvas.addEventListener(
				'webglcontextlost',
				(e) => {
					e.preventDefault();
					setFilterBackend(
						new Canvas2dFilterBackend(),
					);
				},
				{ once: true },
			);
		}
	} catch {}
}
