/**
 * The Blob, object URL and `<a download>` dance, in one place. Substrata and
 * the audio/video tools import this; older catalogue tools still do it inline.
 */

/** For a URL the caller already holds (and keeps responsibility for revoking). */
export function downloadUrl(url: string, filename: string): void {
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	downloadUrl(url, filename);
	// Revoked on the next tick, once the download has started.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(
	text: string,
	filename: string,
	mimeType = 'text/plain;charset=utf-8',
): void {
	downloadBlob(new Blob([text], { type: mimeType }), filename);
}
