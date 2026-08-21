// Whisper source-language picker for the auto-subtitle tool: a Popover holding
// a Command list, the paper-size combobox's shape. Auto-detect first, then the
// most common languages as a flag-tile grid (the colour-notation popover's
// shape), then everything alphabetically. Styling hooks are `.dt-lang-combo*`
// in app/styles/tools/_auto-subtitle.scss; flags are circle-flags SVGs copied
// to public/flags by scripts/copy-flags.mjs.

import { array, fn } from '@ember/helper';
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
import { LANGUAGES } from 'delphitools-v2/lib/transcribe';

const COMMON_COUNT = 12;
const COMMON = LANGUAGES.slice(0, COMMON_COUNT);
const ALL = [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name));

const flagSrc = (code: string) => `/flags/${code}.svg`;

export interface LanguageComboboxSignature {
	Element: HTMLButtonElement;
	Args: {
		/** a Whisper language code, or '' for auto-detect */
		value: string;
		onValueChange: (code: string) => void;
	};
}

export default class LanguageCombobox extends Component<LanguageComboboxSignature> {
	@tracked open = false;

	listId = `${guidFor(this)}-languages`;

	get current() {
		return LANGUAGES.find((lang) => lang.code === this.args.value);
	}

	setOpen = (open: boolean) => {
		this.open = open;
	};

	choose = (code: string) => {
		this.args.onValueChange(code);
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
					class="dt-lang-combo-trigger"
					{{trigger.modifiers}}
					...attributes
				>
					{{#if this.current}}
						<img
							class="dt-lang-flag"
							src={{flagSrc
								this.current.code
							}}
							width="16"
							height="16"
							alt=""
						/>
						<span
							class="dt-lang-combo-value"
						>{{this.current.name}}</span>
					{{else}}
						<Icon
							@name="globe"
							class="dt-lang-flag"
						/>
						<span
							class="dt-lang-combo-value"
						>Auto-detect</span>
					{{/if}}
					<Icon
						@name="chevrons-up-down"
						class="dt-lang-combo-caret"
					/>
				</button>
			</PopoverTrigger>

			<PopoverContent
				id={{this.listId}}
				@align="start"
				class="dt-lang-combo-panel"
			>
				<Command>
					<CommandInput
						@placeholder="Search languages…"
					/>
					<CommandList>
						<CommandEmpty>No language found</CommandEmpty>

						<CommandGroup>
							<CommandItem
								@value="Auto-detect"
								@keywords={{array
									"auto"
									"detect"
								}}
								@onSelect={{fn
									this.choose
									""
								}}
							>
								<Icon
									@name="globe"
									class="dt-lang-flag"
								/>
								<span
								>Auto-detect</span>
								<Icon
									@name="check"
									class="dt-lang-combo-check
										{{if
											(eq
												@value
												''
											)
											'is-on'
										}}"
								/>
							</CommandItem>
						</CommandGroup>
						<CommandSeparator />

						<CommandGroup
							@heading="Common"
							class="dt-lang-combo-common"
						>
							{{#each
								COMMON
								key="code"
								as |lang|
							}}
								<CommandItem
									@value="{{lang.name}} common"
									@keywords={{array
										lang.code
									}}
									@onSelect={{fn
										this.choose
										lang.code
									}}
									class="dt-lang-combo-tile
										{{if
											(eq
												@value
												lang.code
											)
											'is-on'
										}}"
								>
									<img
										class="dt-lang-flag is-large"
										src={{flagSrc
											lang.code
										}}
										width="24"
										height="24"
										alt=""
									/>
									<span
									>{{lang.name}}</span>
								</CommandItem>
							{{/each}}
						</CommandGroup>
						<CommandSeparator />

						<CommandGroup
							@heading="All languages"
						>
							{{#each
								ALL key="code"
								as |lang|
							}}
								<CommandItem
									@value={{lang.name}}
									@keywords={{array
										lang.code
									}}
									@onSelect={{fn
										this.choose
										lang.code
									}}
								>
									<img
										class="dt-lang-flag"
										src={{flagSrc
											lang.code
										}}
										width="16"
										height="16"
										alt=""
										loading="lazy"
									/>
									<span
									>{{lang.name}}</span>
									<span
										class="dt-lang-combo-code"
									>{{lang.code}}</span>
									<Icon
										@name="check"
										class="dt-lang-combo-check
											{{if
												(eq
													@value
													lang.code
												)
												'is-on'
											}}"
									/>
								</CommandItem>
							{{/each}}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	</template>
}
