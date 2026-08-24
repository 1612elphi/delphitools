import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import Icon from 'delphitools-v2/components/icon';
import { PeelSticker } from 'delphitools-v2/components/sticker-wall';
import type { ToolModel } from 'delphitools-v2/routes/tools/tool';

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

				{{#if @model.component}}
					<@model.component />
				{{else}}
					<div class="dt-tool-soon">
						<span
							class="dt-tool-soon-mark"
						><Icon @name="wind" /></span>
						<h2>Coming Soon</h2>
						<p>
							This tool is currently
							under construction.
							Check back soon for the
							full implementation.
						</p>
					</div>
				{{/if}}

				<div class="dt-tool-sticker">
					<PeelSticker
						@tool={{@model.tool.id}}
						@label={{@model.tool.name}}
					/>
				</div>
			</div>
		</div>
	</template>,
);
