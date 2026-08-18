import { pageTitle } from 'ember-page-title';
import { LinkTo } from '@ember/routing';

<template>
	{{pageTitle "404"}}

	<div class="dt-404-page">
		<div class="dt-404-hero">
			<h1 class="dt-404-code">404</h1>
			<p class="dt-404-note">File not found</p>
			<LinkTo @route="index" class="dt-btn dt-404-home">
				Back to safety
			</LinkTo>
		</div>
		<img
			class="dt-404-bottom-tile"
			src="/tiles/bottom-tile.png"
			alt=""
		/>
	</div>
</template>
