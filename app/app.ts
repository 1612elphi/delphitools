import './styles/app.scss';

import Application from '@ember/application';
import compatModules from '@embroider/virtual/compat-modules';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from 'delphitools-v2/config/environment';
import { importSync, isDevelopingApp, macroCondition } from '@embroider/macros';
import setupInspector from '@embroider/legacy-inspector-support/ember-source-4.12';

if (macroCondition(isDevelopingApp())) {
	importSync('./deprecation-workflow');
}

export default class App extends Application {
	modulePrefix = config.modulePrefix;
	podModulePrefix = config.podModulePrefix;
	Resolver = Resolver.withModules(compatModules);
	inspector = setupInspector(this);
}

// development jxl test hook
if (macroCondition(isDevelopingApp())) {
	void import('./lib/jxl').then((m) => {
		(globalThis as unknown as { __jxl?: unknown }).__jxl = m;
	});
}

loadInitializers(App, config.modulePrefix, compatModules);
