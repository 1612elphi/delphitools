/** onboarding bypasses persistence opt-in */

import { getSnapshot } from './doc-store';
import { closeModal, openModal } from './modal';

const SEEN_KEY = 'substrata:onboarding-seen';

export function isOnboardingSeen(): boolean {
	try {
		return !!localStorage.getItem(SEEN_KEY);
	} catch {
		return false;
	}
}

function markOnboardingSeen(): void {
	try {
		localStorage.setItem(SEEN_KEY, '1');
	} catch {
		// ignore storage errors
	}
}

/** open new-scene for blanks */
export function finishOnboarding(): void {
	markOnboardingSeen();
	const doc = getSnapshot();
	closeModal();
	if (!doc || doc.layers.length === 0) openModal('new-scene');
}
