import { pageTitle } from 'ember-page-title';
import { LinkTo } from '@ember/routing';

<template>
	{{pageTitle "Privacy"}}

	<div class="dt-privacy-page">
		<h1 class="dt-privacy-words">
			<span>NO</span>
			<span>DATA</span>
			<span>COLLECTED.</span>
		</h1>
		<LinkTo @route="index" class="dt-btn">Back</LinkTo>
	</div>
</template>
