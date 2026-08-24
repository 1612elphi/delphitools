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

// webworker lib clashes lib.dom
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
