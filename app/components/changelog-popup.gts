import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq, not } from 'ember-truth-helpers';
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

const PILL_TEXT = "what's new?";

const TOOLS_BY_NAME = new Map(
	allTools.map((tool) => [tool.name.toLowerCase(), tool]),
);

interface Entry {
	line: string;
	tool?: Tool;
	lead: string;
	rest: string;
}

function parse(line: string): Entry {
	const colon = line.indexOf(': ');
	if (colon === -1) return { line, lead: line, rest: '' };
	const lead = line.slice(0, colon);
	const tool = TOOLS_BY_NAME.get(lead.toLowerCase());
	return { line, tool, lead, rest: line.slice(colon + 1) };
}

const entries = (lines: string[]) => lines.map(parse);

// a release need not fill every tab
function firstFilledTab(release: Release): string {
	if (release.features.length) return 'features';
	if (release.fixes.length) return 'fixes';
	return 'technical';
}

export default class ChangelogPopup extends Component {
	@tracked release: Release = RELEASES[0]!;
	@tracked tab = firstFilledTab(RELEASES[0]!);

	selectVersion = (event: Event) => {
		const version = (event.target as HTMLSelectElement).value;
		this.release =
			RELEASES.find((entry) => entry.version === version) ??
			RELEASES[0]!;
		this.tab = firstFilledTab(this.release);
	};

	setTab = (value: string) => {
		this.tab = value;
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
				<Tabs
					@value={{this.tab}}
					@onValueChange={{this.setTab}}
				>
					<TabsList class="dt-cl-tabs">
						<TabsTrigger
							class="dt-cl-tab"
							@value="features"
							@disabled={{not
								this.release.features.length
							}}
						>
							Features
						</TabsTrigger>
						<TabsTrigger
							class="dt-cl-tab"
							@value="fixes"
							@disabled={{not
								this.release.fixes.length
							}}
						>
							Fixes
						</TabsTrigger>
						<TabsTrigger
							class="dt-cl-tab"
							@value="technical"
							@disabled={{not
								this.release.technical.length
							}}
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
