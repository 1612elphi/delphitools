import { flowHooks } from './flow-hooks';

/**
 * The Blob, object URL and `<a download>` dance, in one place. Substrata and
 * the audio/video tools import this; older catalogue tools still do it inline.
 *
 * Inside a workflow (lib/workflows.ts) a step's download is captured for the
 * next step instead of saved, so a tool joins a workflow by calling these.
 */

function click(url: string, filename: string): void {
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
}

/** For a URL the caller already holds (and keeps responsibility for revoking). */
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
			// a revoked object URL or an unreadable data URL: save instead
			.catch(() => click(url, filename));
		return;
	}
	click(url, filename);
}

/** Saves whatever the flow state says; the bar hands out captures with this. */
export function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	click(url, filename);
	// Revoked on the next tick, once the download has started.
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
