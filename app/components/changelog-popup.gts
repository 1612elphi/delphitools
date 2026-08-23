import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import Dialog from 'delphitools-v2/components/ui/dialog';
import Icon from 'delphitools-v2/components/icon';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';
import { RELEASES, type Release } from 'delphitools-v2/lib/changelog';

// wording dictated by Ruby verbatim
const PILL_TEXT = "what's new?";

/**
 * The standing changelog pill beside the 2.0 welcome pill: "changes
 * since" a picked baseline, in three tabs. The content is lib/changelog.ts,
 * all of it Ruby's wording.
 */
export default class ChangelogPopup extends Component {
	@tracked release: Release = RELEASES[0]!;

	selectSince = (event: Event) => {
		const since = (event.target as HTMLSelectElement).value;
		this.release =
			RELEASES.find((entry) => entry.since === since) ??
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
				<h2 class="dt-sr-only">Changelog</h2>
				<div class="dt-cl-since">
					<label
						class="dt-cl-since-label"
						for="dt-cl-since"
					>
						Changes since
					</label>
					<select
						id="dt-cl-since"
						class="dt-cl-select"
						{{on "change" this.selectSince}}
					>
						{{#each
							RELEASES key="since"
							as |entry|
						}}
							<option
								value={{entry.since}}
								selected={{eq
									entry
									this.release
								}}
							>{{entry.since}}</option>
						{{/each}}
					</select>
				</div>
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
								this.release.features
								as |line|
							}}
								<li
								>{{line}}</li>
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
								>{{line}}</li>
							{{/each}}
						</ul>
					</TabsContent>
				</Tabs>
				<div class="dt-wn-footer">
					<button
						type="button"
						class="dt-wn-btn is-primary"
						{{on "click" d.close}}
					>
						Close
					</button>
				</div>
			</d.Content>
		</Dialog>
	</template>
}
