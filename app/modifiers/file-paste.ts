import { modifier } from 'ember-modifier';
import { deliverPending } from 'delphitools-v2/lib/flow-hooks';

export default modifier(
	(
		element: HTMLElement,
		[handler]: [(file: File) => void],
		{ accept }: { accept?: string },
	) => {
		const doc = element.ownerDocument;

		const onPaste = (event: ClipboardEvent) => {
			const file = event.clipboardData?.files[0];
			if (!file) return;
			if (accept && !matchesAccept(file, accept)) return;
			event.preventDefault();
			handler(file);
		};

		// document receives focused pastes
		doc.addEventListener('paste', onPaste);

		// deliver pending workflow input
		const cancel = deliverPending(accept, handler);

		return () => {
			cancel();
			doc.removeEventListener('paste', onPaste);
		};
	},
);

export function matchesAccept(file: File, accept: string): boolean {
	return accept.split(',').some((pattern) => {
		const p = pattern.trim();
		if (p.endsWith('/*'))
			return file.type.startsWith(p.slice(0, -1));
		if (p.startsWith('.'))
			return file.name
				.toLowerCase()
				.endsWith(p.toLowerCase());
		return file.type === p;
	});
}
