import { flowHooks } from './flow-hooks';

function click(url: string, filename: string): void {
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
}

export function downloadUrl(url: string, filename: string): void {
	const flow = flowHooks.current;
	if (flow?.capturing) {
		void fetch(url)
			.then((response) => response.blob())
			.then((blob) =>
				flow.capture(
					new File([blob], filename, {
						type: blob.type,
					}),
				),
			)
			.catch(() => click(url, filename));
		return;
	}
	click(url, filename);
}

export function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	click(url, filename);
	// revoke after download starts
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadBlob(blob: Blob, filename: string): void {
	const flow = flowHooks.current;
	if (flow?.capturing) {
		flow.capture(new File([blob], filename, { type: blob.type }));
		return;
	}
	saveBlob(blob, filename);
}

export function downloadText(
	text: string,
	filename: string,
	mimeType = 'text/plain;charset=utf-8',
): void {
	downloadBlob(new Blob([text], { type: mimeType }), filename);
}
