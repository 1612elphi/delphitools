import Component from '@glimmer/component';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';

interface PasteClearSignature {
	Args: {
		text: string;
		onChange: (text: string) => void;
		cells?: boolean;
	};
}

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

export default class PasteClear extends Component<PasteClearSignature> {
	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onChange(text);
	};

	clear = () => this.args.onChange('');

	<template>
		<CanonButton
			@kind={{if @cells "cell"}}
			@text={{unless @cells "Paste"}}
			@label="Paste"
			@icon={{PasteIcon}}
			@onClick={{this.paste}}
		/>
		<CanonButton
			@kind={{if @cells "cell"}}
			@text={{unless @cells "Clear"}}
			@label="Clear"
			@icon={{ClearIcon}}
			@disabled={{if @text false true}}
			@onClick={{this.clear}}
		/>
	</template>
}
