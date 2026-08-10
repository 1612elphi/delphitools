import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import Icon from 'delphitools-v2/components/icon';
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from 'delphitools-v2/components/ui/popover';
import { COLOUR_NOTATIONS } from 'delphitools-v2/lib/colour-notation';
import type { ColourNotation } from 'delphitools-v2/lib/colour-notation';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';

/**
 * The header control for the site-wide colour notation, replacing the Next
 * app's ColourNotationSelector. Every Colour tool reads the same service, so a
 * value copied from one matches the next.
 */
export default class ColourNotationSelector extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked isOpen = false;

	get notations() {
		return COLOUR_NOTATIONS.map((notation) => ({
			...notation,
			isCurrent: notation.id === this.colourNotation.notation,
		}));
	}

	get currentLabel() {
		return (
			COLOUR_NOTATIONS.find(
				(n) => n.id === this.colourNotation.notation,
			)?.label ?? ''
		);
	}

	setOpen = (open: boolean) => {
		this.isOpen = open;
	};

	choose = (id: ColourNotation) => {
		this.colourNotation.setNotation(id);
		this.isOpen = false;
	};

	<template>
		<Popover @open={{this.isOpen}} @onOpenChange={{this.setOpen}}>
			<PopoverTrigger @asChild={{true}} as |trigger|>
				<button
					type="button"
					class="dt-notation-trigger"
					aria-label="Colour notation preference"
					{{trigger.modifiers}}
				>
					<Icon @name="pipette" />
					<span
						class="dt-notation-current"
					>{{this.currentLabel}}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				class="dt-notation-popover"
				@align="end"
			>
				{{! wording carried over from the Next app }}
				<span class="dt-notation-label">Colour Notation</span>
				<div class="dt-notation-grid">
					{{#each
						this.notations key="id"
						as |notation|
					}}
						<button
							type="button"
							class="dt-notation-option
								{{if
									notation.isCurrent
									'is-on'
								}}"
							title={{notation.example}}
							aria-pressed={{if
								notation.isCurrent
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.choose
									notation.id
								)
							}}
						>{{notation.label}}</button>
					{{/each}}
				</div>
			</PopoverContent>
		</Popover>
	</template>
}
