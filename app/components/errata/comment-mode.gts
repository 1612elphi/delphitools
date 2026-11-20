import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import ToolPanel, {
	Field,
	InputField,
	readText,
} from 'delphitools-v2/components/errata/tool-panel';
import {
	commentAuthor,
	setCommentAuthor,
} from 'delphitools-v2/lib/errata/comments';
import { setPageIndex, store } from 'delphitools-v2/lib/errata/store';
import {
	closeMode,
	openNote,
	selectObject,
	selection,
} from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './comment-mode.css';

interface Entry {
	id: string;
	index: number;
	label: string;
}

function excerpt(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > 32 ? `${flat.slice(0, 31)}…` : flat;
}

export default class CommentPanel extends Component<{
	Args: { open: boolean };
}> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	selected = new TrackedExternal(selection.subscribe, selection.get);
	@tracked author = commentAuthor();

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selected.unsubscribe();
	}

	@cached
	get entries(): Entry[] {
		return (this.doc.current?.pages ?? []).flatMap((page, index) =>
			page.objects.flatMap((o) =>
				o.kind === 'comment'
					? [
							{
								id: o.id,
								index,
								label: `${index + 1} · ${excerpt(o.text)}`,
							},
						]
					: [],
			),
		);
	}

	get entry(): Entry | null {
		const ids = this.selected.current;
		if (ids.length !== 1) return null;
		return this.entries.find((e) => e.id === ids[0]) ?? null;
	}

	get labels(): string[] {
		return this.entries.map((e) => e.label);
	}

	get entryIndex(): number | undefined {
		const entry = this.entry;
		return entry ? this.entries.indexOf(entry) : undefined;
	}

	get count() {
		return String(this.entries.length);
	}

	pickIndex = (index: number) => {
		const entry = this.entries[index];
		if (entry) this.pick(entry.id);
	};

	pick = (id: string) => {
		const entry = this.entries.find((e) => e.id === id);
		if (!entry) return;
		setPageIndex(entry.index);
		selectObject(id);
		openNote.set(id);
	};

	setAuthor = (author: string) => {
		this.author = author;
		setCommentAuthor(author);
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="comment"
			@icon="message-square"
			@label="Comment"
			@onApply={{closeMode}}
			@applyLabel="Done"
		>
			<:status>
				<span class="err-mode-tag">Click to place</span>
			</:status>
			<:default>
				<InputField @label="Author">
					<input
						class="err-mode-input"
						aria-label="Author"
						value={{this.author}}
						{{on
							"input"
							(readText
								this.setAuthor
							)
						}}
					/>
				</InputField>
				<Field @label="List">
					<CanonMenuCell
						class="err-comment-menu"
						@items={{this.labels}}
						@selected={{this.entryIndex}}
						@placeholder={{this.count}}
						@repicks={{true}}
						@label="List"
						@disabled={{if
							this.entries.length
							false
							true
						}}
						@onChange={{this.pickIndex}}
					/>
				</Field>
			</:default>
		</ToolPanel>
	</template>
}
