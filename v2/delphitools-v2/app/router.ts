import EmberRouter from '@embroider/router';
import config from 'delphitools-v2/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  // `tool_id` matches the web IDs in app/lib/tools.ts, which PARITY.md holds the
  // CLI and iOS repos to. The URLs are unchanged from the Next app.
  this.route('tools', function () {
    this.route('tool', { path: '/:tool_id' });
  });
  this.route('editor');
  this.route('not-found', { path: '/*path' });
});
