import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import { LinkTo } from '@ember/routing';
import Dialog from 'delphitools-v2/components/ui/dialog';
import Icon from 'delphitools-v2/components/icon';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';
import { RELEASES, type Release } from 'delphitools-v2/lib/changelog';
import { allTools, type Tool } from 'delphitools-v2/lib/tools';

// wording dictated by Ruby verbatim
const PILL_TEXT = "what's new?";

const TOOLS_BY_NAME = new Map(
	allTools.map((tool) => [tool.name.toLowerCase(), tool]),
);

interface Entry {
	line: string;
	/** set when the text before the first colon names a catalogue tool */
	tool?: Tool;
	lead: string;
	rest: string;
}

/** "Name: text" entries whose name is a tool get a badge and a link. */
function parse(line: string): Entry {
	const colon = line.indexOf(': ');
	if (colon === -1) return { line, lead: line, rest: '' };
	const lead = line.slice(0, colon);
	const tool = TOOLS_BY_NAME.get(lead.toLowerCase());
	return { line, tool, lead, rest: line.slice(colon + 1) };
}

const entries = (lines: string[]) => lines.map(parse);

/**
 * The standing changelog pill beside the 2.0 welcome pill. The content is
 * lib/changelog.ts, all of it Ruby's wording; the title's version picker
 * chooses the release.
 */
export default class ChangelogPopup extends Component {
	@tracked release: Release = RELEASES[0]!;

	selectVersion = (event: Event) => {
		const version = (event.target as HTMLSelectElement).value;
		this.release =
			RELEASES.find((entry) => entry.version === version) ??
			RELEASES[0]!;
	};

	<template>
		<Dialog as |d|>
			<button
				type="button"
				class="dt-hero-pill"
				{{d.focusOnClose}}
				{{on "click" d.open}}
			>
				<Icon @name="sparkles" />
				{{PILL_TEXT}}
			</button>
			<d.Content class="dt-wn dt-cl">
				{{! title wording dictated by Ruby verbatim }}
				<h2 class="dt-cl-title">
					What's new in version
					<select
						class="dt-cl-version"
						aria-label="Version"
						{{on
							"change"
							this.selectVersion
						}}
					>
						{{#each
							RELEASES key="version"
							as |entry|
						}}
							<option
								value={{entry.version}}
								selected={{eq
									entry
									this.release
								}}
							>{{entry.version}}</option>
						{{/each}}
					</select>?
				</h2>
				<Tabs @defaultValue="features">
					<TabsList class="dt-cl-tabs">
						<TabsTrigger
							class="dt-cl-tab"
							@value="features"
						>
							Features
						</TabsTrigger>
						<TabsTrigger
							class="dt-cl-tab"
							@value="fixes"
						>
							Fixes
						</TabsTrigger>
						<TabsTrigger
							class="dt-cl-tab"
							@value="technical"
						>
							Technical
						</TabsTrigger>
					</TabsList>
					<TabsContent
						class="dt-cl-body"
						@value="features"
					>
						<ul class="dt-cl-list">
							{{#each
								(entries
									this.release.features
								)
								as |entry|
							}}
								<li
									class="dt-cl-item"
								>
									{{#if
										entry.tool
									}}
										<LinkTo
											@route="tools.tool"
											@model={{entry.tool.id}}
											class="dt-cl-tool"
										>
											<span
												class="dt-cl-badge"
												aria-hidden="true"
											>
												<Icon
													@name="star"
												/>
												<Icon
													@name="wrench"
												/>
											</span>
											{{entry.lead}}</LinkTo>:{{entry.rest}}
									{{else}}
										{{entry.line}}
									{{/if}}
								</li>
							{{/each}}
						</ul>
					</TabsContent>
					<TabsContent
						class="dt-cl-body"
						@value="fixes"
					>
						<ul class="dt-cl-list">
							{{#each
								this.release.fixes
								as |line|
							}}
								<li
									class="dt-cl-item"
								>{{line}}</li>
							{{/each}}
						</ul>
					</TabsContent>
					<TabsContent
						class="dt-cl-body"
						@value="technical"
					>
						<ul class="dt-cl-list">
							{{#each
								this.release.technical
								as |line|
							}}
								<li
									class="dt-cl-item"
								>{{line}}</li>
							{{/each}}
						</ul>
					</TabsContent>
				</Tabs>
				<div class="dt-cl-actions">
					<button
						type="button"
						class="dt-cl-close"
						{{on "click" d.close}}
					>
						Close
					</button>
				</div>
			</d.Content>
		</Dialog>
	</template>
}
