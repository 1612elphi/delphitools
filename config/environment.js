'use strict';

module.exports = function (environment) {
	const ENV = {
		modulePrefix: 'delphitools-v2',
		environment,
		rootURL: '/',
		locationType: 'history',
		EmberENV: {
			EXTEND_PROTOTYPES: false,
			FEATURES: {},
		},

		APP: {},
	};

	if (environment === 'development') {}

	if (environment === 'test') {
		// testem requires no location
		ENV.locationType = 'none';

		ENV.APP.LOG_ACTIVE_GENERATION = false;
		ENV.APP.LOG_VIEW_LOOKUPS = false;

		ENV.APP.rootElement = '#ember-testing';
		ENV.APP.autoboot = false;
	}

	if (environment === 'production') {}

	return ENV;
};
