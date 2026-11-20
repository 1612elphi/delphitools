import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCommand, {
	type CanonCommandItem,
} from 'delphicanon/components/canon-command';
import CanonDialog, {
	type CanonDialogClose,
} from 'delphicanon/components/canon-dialog';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	AUTO_DETECT,
	getFormat,
	type PandocFormat,
} from 'delphitools-v2/lib/pandoc/formats';

interface FormatPickSignature {
	Args: {
		value: string;
		formats: PandocFormat[];
		label: string;
		includeAuto?: boolean;
		autoDetectedLabel?: string | null;
		onChange: (id: string) => void;
	};
}

const Check = <template><IconSvg @name="check" /></template>;

export default class FormatPick extends Component<FormatPickSignature> {
	@tracked open = false;

	get text() {
		const { value, autoDetectedLabel } = this.args;
		if (value === AUTO_DETECT)
			return autoDetectedLabel
				? `Auto-detect · ${autoDetectedLabel}`
				: 'Auto-detect';
		return getFormat(value)?.label ?? value;
	}

	get items(): CanonCommandItem[] {
		const { value, formats, includeAuto, autoDetectedLabel } =
			this.args;
		const items: CanonCommandItem[] = formats.map((f) => ({
			id: f.id,
			title: f.label,
			detail: f.subtitle,
			group: f.tier === 1 ? 'Common' : 'More formats',
			keywords: [f.id, f.ext],
			icon: f.id === value ? Check : undefined,
		}));
		if (includeAuto)
			items.unshift({
				id: AUTO_DETECT,
				title: 'Auto-detect',
				detail: autoDetectedLabel
					? `Looks like ${autoDetectedLabel}`
					: 'Guess from the input',
				keywords: [
					'auto',
					'detect',
					'automatic',
					'guess',
				],
				icon: value === AUTO_DETECT ? Check : undefined,
			});
		return items;
	}

	get name() {
		return `${this.args.label}, ${this.text}`;
	}

	show = () => (this.open = true);

	closed = () => (this.open = false);

	pick = (close: CanonDialogClose, picked: CanonCommandItem) => {
		this.args.onChange(picked.id);
		close();
	};

	<template>
		<CanonButton
			class="dc-format-pick"
			@kind="cell"
			@text={{this.text}}
			aria-label={{this.name}}
			aria-haspopup="dialog"
			@onClick={{this.show}}
		/>
		<CanonDialog
			class="dc-format-dialog"
			@open={{this.open}}
			@onClose={{this.closed}}
			aria-label={{@label}}
		>
			<:default as |close|>
				<CanonCommand
					@items={{this.items}}
					@placeholder="Search formats…"
					@label={{@label}}
					@empty="No format found."
					@onSelect={{fn this.pick close}}
				/>
			</:default>
		</CanonDialog>
	</template>
}
