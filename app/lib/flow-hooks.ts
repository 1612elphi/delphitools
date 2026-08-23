import type FlowService from 'delphitools-v2/services/flow';

/**
 * The flow service, for code with no owner to inject it: lib/download.ts
 * captures a blob instead of downloading it, the filePaste modifier hands a
 * new step the files earlier steps produced, lib/colour-query's carryColour
 * pushes a colour. Null until the service boots, so every caller falls
 * through to its normal path.
 */
export const flowHooks: { current: FlowService | null } = { current: null };

export const reducedMotion = () =>
	matchMedia('(prefers-reduced-motion: reduce)').matches;

/** template helper: is the current step's download a hand-off? */
export const capturing = () => flowHooks.current?.capturing ?? false;

/** template helper: a download control's label, "Pass along" during a hand-off */
export const passAlong = (label: string) =>
	capturing() ? 'Pass along' : label;

/** template helper: the icon of an icon-only download control */
export const downloadIcon = () => (capturing() ? 'arrow-right' : 'download');

/**
 * Hands the files earlier steps produced to an intake's own handler, the
 * way a paste would. Returns a cancel for intakes that can be torn down
 * before the answer arrives.
 */
export function deliverPending(
	accept: string | undefined,
	handler: (file: File) => void,
): () => void {
	let live = true;
	void flowHooks.current?.pending(accept).then((files) => {
		if (live) for (const file of files) handler(file);
	});
	return () => {
		live = false;
	};
}
