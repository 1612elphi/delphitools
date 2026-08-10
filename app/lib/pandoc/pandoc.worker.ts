/* Web Worker that hosts the pandoc WebAssembly engine off the main thread.
 *
 * The worker is the boundary for the heavy work: instantiating the 58 MB module
 * and running conversions (a synchronous wasm call) here keeps the UI responsive.
 * The main thread talks to it only via the message protocol below.
 */
import { createPandocInstance } from './pandoc-core.js';
import type {
	PandocInstance,
	PandocConvertResult,
	PandocQueryOptions,
} from './pandoc-core.js';

type InMessage =
	| { type: 'init'; wasm: ArrayBuffer }
	| { type: 'query'; id: number; options: PandocQueryOptions }
	| {
			type: 'convert';
			id: number;
			options: Record<string, unknown>;
			stdin: string | null;
			files: Record<string, Blob | string>;
	  };

type OutMessage =
	| { type: 'ready' }
	| { type: 'init-error'; error: string }
	| { type: 'result'; id: number; ok: true; data: unknown }
	| { type: 'result'; id: number; ok: false; error: string };

// A `/// <reference lib="webworker" />` would leak into the whole program and
// clash with lib.dom, so the worker global is typed locally instead.
declare const self: {
	onmessage: ((event: MessageEvent<InMessage>) => void) | null;
	postMessage(message: OutMessage): void;
};

let instance: PandocInstance | null = null;

self.onmessage = (event: MessageEvent<InMessage>) => {
	void handleMessage(event.data);
};

async function handleMessage(msg: InMessage): Promise<void> {
	if (msg.type === 'init') {
		try {
			instance = await createPandocInstance(msg.wasm);
			self.postMessage({ type: 'ready' });
		} catch (err) {
			self.postMessage({
				type: 'init-error',
				error: String(err),
			});
		}
		return;
	}

	if (!instance) {
		self.postMessage({
			type: 'result',
			id: msg.id,
			ok: false,
			error: 'Pandoc engine is not initialised yet.',
		});
		return;
	}

	try {
		if (msg.type === 'query') {
			const data = instance.query(msg.options);
			self.postMessage({
				type: 'result',
				id: msg.id,
				ok: true,
				data,
			});
		} else if (msg.type === 'convert') {
			const data: PandocConvertResult =
				await instance.convert(
					msg.options,
					msg.stdin,
					msg.files,
				);
			self.postMessage({
				type: 'result',
				id: msg.id,
				ok: true,
				data,
			});
		}
	} catch (err) {
		self.postMessage({
			type: 'result',
			id: msg.id,
			ok: false,
			error: String(err),
		});
	}
}
