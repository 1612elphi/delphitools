import Component from '@glimmer/component';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import { paperSizeGroups } from 'delphitools-v2/lib/paper-sizes';
import './paper-menu.css';

const SIZES = paperSizeGroups
	.filter((group) => group.id !== 'common')
	.flatMap((group) => group.sizes);

const TITLES = SIZES.map(
	(size) =>
		`${size.label} (${Math.round(size.widthMm)} × ${Math.round(size.heightMm)})`,
);

export default class PaperMenu extends Component<{
	Element: HTMLDivElement;
	Args: {
		value: string;
		label: string;
		placeholder?: string;
		onChange: (id: string) => void;
	};
}> {
	get index(): number | undefined {
		const i = SIZES.findIndex((s) => s.id === this.args.value);
		return i < 0 ? undefined : i;
	}

	pick = (index: number) => {
		const size = SIZES[index];
		if (size) this.args.onChange(size.id);
	};

	<template>
		<CanonMenuCell
			class="err-menu-cell"
			@items={{TITLES}}
			@selected={{this.index}}
			@placeholder={{@placeholder}}
			@label={{@label}}
			@onChange={{this.pick}}
			...attributes
		/>
	</template>
}
