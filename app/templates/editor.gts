import { pageTitle } from 'ember-page-title';
import SubstrataShell from 'delphitools-v2/components/substrata/substrata-shell';

// bypass application chrome
<template>
	{{pageTitle "Substrata"}}

	<div class="sub-editor-viewport">
		<SubstrataShell />
	</div>
</template>
