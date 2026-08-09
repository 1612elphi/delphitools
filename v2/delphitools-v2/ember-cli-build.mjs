import EmberApp from 'ember-cli/lib/broccoli/ember-app.js';
import { compatBuild } from '@embroider/compat';

export default async function (defaults) {
	const { buildOnce } = await import('@embroider/vite');

	const app = new EmberApp(defaults, {
		// Add options here
	});

	// Nothing under app/lib is resolved by name: every one is imported by an
	// explicit specifier from the tool that uses it. Without this they all land
	// in @embroider/virtual/compat-modules, which the app entry imports eagerly,
	// so the Shavian dictionary and the colour-name list ship to every visitor.
	return compatBuild(app, buildOnce, { staticAppPaths: ['lib'] });
}
