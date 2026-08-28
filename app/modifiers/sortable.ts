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
			handle?: string;
			disabled?: boolean;
			// dnd-kit type/accept filter
			type?: UniqueIdentifier;
			accept?: UniqueIdentifier | UniqueIdentifier[];
			manager?: DragDropManager;
		};
	};
}

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
					...(named.type !== undefined
						? { type: named.type }
						: {}),
					...(named.accept !== undefined
						? { accept: named.accept }
						: {}),
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
