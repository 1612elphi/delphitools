import { pageTitle } from 'ember-page-title';
import SubstrataShell from 'delphitools-v2/components/substrata/substrata-shell';

// Substrata editor root. The application template skips its .dt-shell chrome
// for this route (no sidebar, no header) — the editor owns the whole
// viewport; the canvas owns its own panning/zoom.
<template>
	{{pageTitle "Substrata"}}

	<div class="sub-editor-viewport">
		<SubstrataShell />
	</div>
</template>
