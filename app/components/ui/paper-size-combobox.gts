// Paper-size picker shared by the zine imposer and the print imposer: a
// Popover holding a Command list, with the whole paper-size catalogue grouped
// by series. Styling hooks are `.dt-paper-combo*`, defined in
// app/styles/tools/_zine-imposer.scss.

import { fn } from '@ember/helper';
import { guidFor } from '@ember/object/internals';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { eq } from 'ember-truth-helpers';

import Icon from 'delphitools-v2/components/icon';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from 'delphitools-v2/components/ui/command';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from 'delphitools-v2/components/ui/popover';
import { findPaperSize, paperSizeGroups } from 'delphitools-v2/lib/paper-sizes';

/**
 * Command matches on the item's `value`, so it carries the label plus the
 * series — searching "ISO A" finds the whole series, and the A4 that appears in
 * both Common and ISO A stays two distinct values.
 */
const GROUPS = paperSizeGroups.map((group) => ({
	id: group.id,
	heading: group.label,
	items: group.sizes.map((size) => ({
		id: size.id,
		label: size.label,
		value: `${size.label} ${group.id === 'common' ? 'common' : size.series}`,
		dimensions: `${Math.round(size.widthMm)} × ${Math.round(size.heightMm)}`,
	})),
}));

const COMMON_GROUP = GROUPS.find((g) => g.id === 'common');
const OTHER_GROUPS = GROUPS.filter((g) => g.id !== 'common');

export interface PaperSizeComboboxSignature {
	Element: HTMLButtonElement;
	Args: {
		value: string;
		onValueChange: (id: string) => void;
		/** Offer "Infer from PDF" as the first entry. */
		showInfer?: boolean;
		/** Offer "Custom…" as the last entry. */
		showCustom?: boolean;
		/** Whether a PDF has been read, which changes the infer label. */
		hasInferred?: boolean;
		/** The inferred size's label, shown when infer is selected. */
		inferredLabel?: string;
		triggerClass?: string;
		contentClass?: string;
	};
}

export default class PaperSizeCombobox extends Component<PaperSizeComboboxSignature> {
	@tracked open = false;

	listId = `${guidFor(this)}-sizes`;

	get displayLabel(): string {
		const { value, hasInferred, inferredLabel } = this.args;
		if (value === 'infer') {
			return hasInferred && inferredLabel
				? `Infer (${inferredLabel})`
				: 'Infer from PDF';
		}
		if (value === 'custom') return 'Custom…';
		return findPaperSize(value)?.label ?? value;
	}

	setOpen = (open: boolean) => {
		this.open = open;
	};

	choose = (id: string) => {
		this.args.onValueChange(id);
		this.open = false;
	};

	<template>
		<Popover @open={{this.open}} @onOpenChange={{this.setOpen}}>
			<PopoverTrigger @asChild={{true}} as |trigger|>
				<button
					type="button"
					role="combobox"
					aria-expanded={{if
						this.open
						"true"
						"false"
					}}
					aria-controls={{this.listId}}
					aria-haspopup="dialog"
					class="dt-paper-combo-trigger
						{{@triggerClass}}"
					{{trigger.modifiers}}
					...attributes
				>
					<span
						class="dt-paper-combo-value"
					>{{this.displayLabel}}</span>
					<Icon
						@name="chevrons-up-down"
						class="dt-paper-combo-caret"
					/>
				</button>
			</PopoverTrigger>

			<PopoverContent
				id={{this.listId}}
				@align="start"
				class="dt-paper-combo-panel {{@contentClass}}"
			>
				<Command>
					{{! wording carried over from the Next app }}
					<CommandInput
						@placeholder="Search paper sizes…"
					/>
					<CommandList>
						{{! wording carried over from the Next app }}
						<CommandEmpty>No paper size
							found.</CommandEmpty>

						{{#if @showInfer}}
							<CommandGroup>
								<CommandItem
									@value="infer"
									@onSelect={{fn
										this.choose
										"infer"
									}}
								>
									<Icon
										@name="scan-search"
										class="dt-paper-combo-check
											{{if
												(eq
													@value
													'infer'
												)
												'is-on'
												'is-dim'
											}}"
									/>
									{{! wording carried over from the Next app }}
									<span
									>Infer
										from
										PDF</span>
								</CommandItem>
							</CommandGroup>
							<CommandSeparator />
						{{/if}}

						{{#if COMMON_GROUP}}
							<CommandGroup
								@heading={{COMMON_GROUP.heading}}
							>
								{{#each
									COMMON_GROUP.items
									key="value"
									as |item|
								}}
									<CommandItem
										@value={{item.value}}
										@onSelect={{fn
											this.choose
											item.id
										}}
									>
										<Icon
											@name="check"
											class="dt-paper-combo-check
												{{if
													(eq
														@value
														item.id
													)
													'is-on'
												}}"
										/>
										<span
										>{{item.label}}</span>
										<span
											class="dt-paper-combo-dims"
										>{{item.dimensions}}</span>
									</CommandItem>
								{{/each}}
							</CommandGroup>
							<CommandSeparator />
						{{/if}}

						{{#each
							OTHER_GROUPS key="id"
							as |group|
						}}
							<CommandGroup
								@heading={{group.heading}}
							>
								{{#each
									group.items
									key="value"
									as |item|
								}}
									<CommandItem
										@value={{item.value}}
										@onSelect={{fn
											this.choose
											item.id
										}}
									>
										<Icon
											@name="check"
											class="dt-paper-combo-check
												{{if
													(eq
														@value
														item.id
													)
													'is-on'
												}}"
										/>
										<span
										>{{item.label}}</span>
										<span
											class="dt-paper-combo-dims"
										>{{item.dimensions}}</span>
									</CommandItem>
								{{/each}}
							</CommandGroup>
						{{/each}}

						{{#if @showCustom}}
							<CommandSeparator />
							<CommandGroup>
								<CommandItem
									@value="custom"
									@onSelect={{fn
										this.choose
										"custom"
									}}
								>
									<Icon
										@name="check"
										class="dt-paper-combo-check
											{{if
												(eq
													@value
													'custom'
												)
												'is-on'
											}}"
									/>
									<span
									>Custom…</span>
								</CommandItem>
							</CommandGroup>
						{{/if}}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	</template>
}
