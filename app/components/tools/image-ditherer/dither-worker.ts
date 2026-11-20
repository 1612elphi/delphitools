import { dither, type DitherOptions } from 'delphitools-v2/lib/dither';

export interface DitherRequest {
	id: number;
	data: Uint8ClampedArray;
	width: number;
	height: number;
	options: DitherOptions;
}

export interface DitherReply {
	id: number;
	data: Uint8ClampedArray;
}

// tsconfig lacks worker lib
const scope = self as unknown as {
	onmessage: ((event: MessageEvent<DitherRequest>) => void) | null;
	postMessage(reply: DitherReply, transfer: Transferable[]): void;
};

scope.onmessage = ({ data: { id, data, width, height, options } }) => {
	dither(data, width, height, options);
	scope.postMessage({ id, data }, [data.buffer]);
};
