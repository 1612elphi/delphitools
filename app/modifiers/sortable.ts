import Modifier from 'ember-modifier';
import { registerDestructor } from '@ember/destroyable';
import type { DragDropManager } from '@dnd-kit/dom';
import { Sortable } from '@dnd-kit/dom/sortable';
import type { Data, UniqueIdentifier } from '@dnd-kit/abstract';
import { dndManager } from 'delphitools-v2/lib/dnd';

export interface SortableSignature {
	Element: HTMLElement;
	Args: {
		Positional: [];
		Named: {
			id: string | number;
			index: number;
			group?: UniqueIdentifier;
			data?: Data;
			/** selector resolved inside the element for the drag handle */
			handle?: string;
			disabled?: boolean;
			manager?: DragDropManager;
		};
	};
}

/**
 * `@dnd-kit/dom` Sortable as a modifier — the `useSortable` binding the Next
 * layer rows use. Commit the new order from a `dragend` listener on the
 * owning manager; the sortable's optimistic reorder previews mid-drag.
 *
 * Class-based so an index/disabled change WRITES the live entity: Sortable
 * only animates when `index` moves away from its remembered previous index,
 * so recreating the instance per change (what a function modifier does)
 * kills the reorder transition — and destroys the entity mid-drag.
 */
export default class SortableModifier extends Modifier<SortableSignature> {
	#sortable: Sortable | null = null;
	#element: HTMLElement | null = null;
	#id: string | number | null = null;
	#manager: DragDropManager | null = null;

	constructor(
		...args: ConstructorParameters<
			typeof Modifier<SortableSignature>
		>
	) {
		super(...args);
		registerDestructor(this, () => this.#sortable?.destroy());
	}

	modify(
		element: HTMLElement,
		_positional: [],
		named: SortableSignature['Args']['Named'],
	) {
		const manager = named.manager ?? dndManager;
		if (
			!this.#sortable ||
			this.#element !== element ||
			this.#id !== named.id ||
			this.#manager !== manager
		) {
			this.#sortable?.destroy();
			const handle = named.handle
				? (element.querySelector(named.handle) ??
					undefined)
				: undefined;
			this.#sortable = new Sortable(
				{
					id: named.id,
					element,
					handle,
					index: named.index,
					group: named.group,
					data: named.data,
					disabled: named.disabled ?? false,
				},
				manager,
			);
			this.#element = element;
			this.#id = named.id;
			this.#manager = manager;
		} else {
			this.#sortable.index = named.index;
			this.#sortable.disabled = named.disabled ?? false;
		}
	}
}
