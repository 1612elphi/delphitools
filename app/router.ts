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
	this.route('errata');
	this.route('workflows');
	this.route('workflow', { path: '/w/:steps' });
	this.route('experiments');
	this.route('elsewhere');
	this.route('canon', function () {
		this.route('installation');
		this.route('components', function () {
			this.route('component', { path: '/:name' });
		});
		this.route('patterns', function () {
			this.route('pattern', { path: '/:name' });
		});
		this.route('screens', function () {
			this.route('screen', { path: '/:name' });
		});
		this.route('blocks', function () {
			this.route('block', { path: '/:name' });
		});
	});
	this.route('privacy');
	this.route('not-found', { path: '/*path' });
});
