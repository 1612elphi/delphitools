import { modifier } from 'ember-modifier';
import { deliverPending } from 'delphitools-v2/lib/flow-hooks';

/**
 * Hands the first pasted file matching `accept` to the handler, replacing the
 * Next app's use-file-paste hook — 23 tools there use it.
 *
 * The listener is on the document, because a paste lands on whatever has focus
 * rather than on the tool. The element only bounds the listener's lifetime, so
 * put this on whichever wrapper the tool already has:
 *
 *   <div {{filePaste this.readFile accept="image/*"}}>
 */
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

		doc.addEventListener('paste', onPaste);

		// A workflow step takes the earlier steps' output the way it takes
		// a paste: through this handler, once the tool is on screen.
		const cancel = deliverPending(accept, handler);

		return () => {
			cancel();
			doc.removeEventListener('paste', onPaste);
		};
	},
);

/** The three forms an accept attribute takes: `image/*`, `.svg`, `image/png`. */
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
