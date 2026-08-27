import EmberRouter from '@embroider/router';
import config from 'delphitools-v2/config/environment';

export default class Router extends EmberRouter {
	location = config.locationType;
	rootURL = config.rootURL;
}

Router.map(function () {
	this.route('tools', function () {
		this.route('tool', { path: '/:tool_id' });
	});
	this.route('editor');
	this.route('workflows');
	this.route('experiments');
	this.route('not-found', { path: '/*path' });
});
