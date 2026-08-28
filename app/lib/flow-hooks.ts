import type FlowService from 'delphitools-v2/services/flow';

// ownerless flow service
export const flowHooks: { current: FlowService | null } = { current: null };

export const reducedMotion = () =>
	matchMedia('(prefers-reduced-motion: reduce)').matches;

export const capturing = () => flowHooks.current?.capturing ?? false;

export const passAlong = (label: string) =>
	capturing() ? 'Pass along' : label;

export const downloadIcon = () => (capturing() ? 'arrow-right' : 'download');

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
