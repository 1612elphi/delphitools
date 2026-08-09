import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import Icon from 'delphitools-v2/components/icon';
import { TOOL_COMPONENTS } from 'delphitools-v2/components/tools/registry';
import type { ToolModel } from 'delphitools-v2/routes/tools/tool';

// The shape every tool page inherits: capped header block, then the tool's own
// component at whatever width it asked for. Mirrors the Next app's
// tools/[toolId]/page.tsx, minus the sticker (GSAP, Phase 1).
function componentFor(id: string) {
	return TOOL_COMPONENTS[id];
}

export default RouteTemplate<{ Args: { model: ToolModel } }>(
	<template>
		{{pageTitle @model.tool.name}}

		<div class="dt-tool-page">
			<div
				class="dt-tool-body
					{{unless @model.tool.wide 'is-capped'}}"
			>
				<header
					class="dt-tool-header
						{{if
							@model.tool.wide
							'is-capped'
						}}"
				>
					<span class="dt-tool-icon">
						<Icon
							@name={{@model.tool.icon}}
						/>
					</span>
					<div class="dt-tool-heading">
						<div class="dt-tool-titles">
							<h1
							>{{@model.tool.name}}</h1>
							{{#if @model.category}}
								<span
									class="dt-badge"
								>{{@model.category.name}}</span>
							{{/if}}
							{{#if @model.tool.beta}}
								<span
									class="dt-badge is-beta"
								>Beta</span>
							{{/if}}
							{{#if @model.tool.new}}
								<span
									class="dt-badge is-new"
								>New</span>
							{{/if}}
						</div>
						<p
							class="dt-tool-desc"
						>{{@model.tool.description}}</p>
					</div>
				</header>

				{{#let
					(componentFor @model.tool.id)
					as |ToolComponent|
				}}
					{{#if ToolComponent}}
						<ToolComponent />
					{{else}}
						{{! wording carried over from the Next app's placeholder card }}
						<div class="dt-tool-soon">
							<span
								class="dt-tool-soon-mark"
							><Icon
									@name="wind"
								/></span>
							<h2>Coming Soon</h2>
							<p>
								This tool is
								currently under
								construction.
								Check back soon
								for the full
								implementation.
							</p>
						</div>
					{{/if}}
				{{/let}}
			</div>
		</div>
	</template>,
);
