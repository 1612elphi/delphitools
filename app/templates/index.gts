import ToolGrid from 'delphitools-v2/components/tool-grid';
import { toolCategories, featuredTools } from 'delphitools-v2/lib/tools';

// Body copy below is carried over verbatim from the Next home page; none of it
// is new wording. The sticker wall, the TAXIWAY split-flap and Friends of Delphi
// depend on GSAP/motion and are Phase 1.
<template>
	<div class="dt-page">
		<header class="dt-hero">
			<img
				src="/delphi-friday.png"
				alt=""
				class="dt-hero-art"
			/>
			<h1 class="dt-sr-only">delphitools</h1>

			<div class="dt-hero-copy">
				<p class="dt-hero-lead">
					A collection of small, low stakes and
					low effort tools.
				</p>
				<p>
					No logins, no registration, no data
					collection. I can&apos;t believe I have
					to say that. Long live the handmade web.
				</p>
			</div>
		</header>

		<section class="dt-section">
			<h2 class="dt-section-title">
				Greatest Hits
				<span
					class="dt-section-count"
				>{{featuredTools.length}}</span>
			</h2>
			<ToolGrid @tools={{featuredTools}} />
		</section>

		{{#each toolCategories as |category|}}
			<section class="dt-section">
				<h2 class="dt-section-title">
					{{category.name}}
					<span
						class="dt-section-count"
					>{{category.tools.length}}</span>
				</h2>
				<ToolGrid @tools={{category.tools}} />
			</section>
		{{/each}}
	</div>
</template>
