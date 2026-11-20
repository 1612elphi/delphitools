import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { IconSvg } from 'delphitools-v2/components/icon';
import { renameProject } from 'delphitools-v2/lib/substrata/projects';
import type { RenameTarget } from './page-state';

interface Signature {
	Args: { target: RenameTarget; onDone: () => void };
}

export default class RenameForm extends Component<Signature> {
	draft = this.args.target.name;

	edit = (value: string) => {
		this.draft = value;
	};

	apply = () => {
		const name = this.draft.trim();
		if (name && name !== this.args.target.name.trim())
			void renameProject(this.args.target.id, name).then(
				this.args.target.after,
			);
		this.args.onDone();
	};

	enter = (e: KeyboardEvent) => {
		if (e.key === 'Enter') this.apply();
	};

	<template>
		<CanonHeading @text="Rename" />
		<CanonTextCell
			class="sub-pg-name"
			@value={{@target.name}}
			@placeholder="Untitled scene"
			@onChange={{this.edit}}
			aria-label="Name"
			data-autofocus
			{{on "keydown" this.enter}}
		/>
		<CanonButton
			class="sub-pg-primary"
			@kind="primary"
			@text="Rename"
			@icon={{component IconSvg name="check"}}
			@onClick={{this.apply}}
		/>
	</template>
}
