// false outside browsers

export interface Capabilities {
	secureContext: boolean;
	// wasm fallback only
	crossOriginIsolated: boolean;
	webgpu: boolean;
	webgl2: boolean;
	// origin private filesystem
	opfs: boolean;
	// chromium file picker
	fileSystemAccess: boolean;
	worker: boolean;
	// content hashing
	cryptoSubtle: boolean;
	createImageBitmap: boolean;
}

function probeWebGL2(): boolean {
	if (typeof document === 'undefined') return false;
	try {
		const canvas = document.createElement('canvas');
		return !!canvas.getContext('webgl2');
	} catch {
		return false;
	}
}

export function detectCapabilities(): Capabilities {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return {
			secureContext: false,
			crossOriginIsolated: false,
			webgpu: false,
			webgl2: false,
			opfs: false,
			fileSystemAccess: false,
			worker: false,
			cryptoSubtle: false,
			createImageBitmap: false,
		};
	}

	return {
		secureContext: window.isSecureContext === true,
		crossOriginIsolated: window.crossOriginIsolated === true,
		webgpu: 'gpu' in navigator,
		webgl2: probeWebGL2(),
		opfs: typeof navigator.storage?.getDirectory === 'function',
		fileSystemAccess: 'showOpenFilePicker' in window,
		worker: typeof Worker !== 'undefined',
		cryptoSubtle: typeof crypto !== 'undefined' && !!crypto.subtle,
		createImageBitmap: typeof createImageBitmap === 'function',
	};
}
