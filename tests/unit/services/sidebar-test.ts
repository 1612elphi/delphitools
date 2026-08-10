import { module, test } from 'qunit';
import { setupTest } from 'delphitools-v2/tests/helpers';
import type SidebarService from 'delphitools-v2/services/sidebar';

const COOKIE = 'sidebar_state';

function clearCookies() {
	for (const pair of document.cookie.split(';')) {
		const name = pair.split('=')[0]?.trim();
		if (name) document.cookie = `${name}=; path=/; max-age=0`;
	}
}

module('Unit | Service | sidebar', function (hooks) {
	setupTest(hooks);

	hooks.beforeEach(clearCookies);
	hooks.afterEach(clearCookies);

	// The cookie is read in the constructor, so every test sets it before the
	// first lookup rather than in beforeEach.
	const lookup = (ctx: object) =>
		(
			ctx as { owner: { lookup(n: string): SidebarService } }
		).owner.lookup('service:sidebar');

	test('defaults to expanded when no cookie is set', function (assert) {
		const sidebar = lookup(this);
		assert.true(sidebar.open);
		assert.strictEqual(sidebar.state, 'expanded');
	});

	test('restores the collapsed state from the cookie', function (assert) {
		document.cookie = `${COOKIE}=false; path=/`;
		const sidebar = lookup(this);
		assert.false(sidebar.open);
		assert.strictEqual(sidebar.state, 'collapsed');
	});

	test('restores the expanded state from the cookie', function (assert) {
		document.cookie = `${COOKIE}=true; path=/`;
		assert.true(lookup(this).open);
	});

	// The parse is anchored to a cookie boundary; a plain substring match would
	// read this decoy and collapse the sidebar.
	test('ignores a different cookie whose name ends in the same suffix', function (assert) {
		document.cookie = `x_${COOKIE}=false; path=/`;
		assert.true(lookup(this).open);
	});

	test('toggle on desktop flips the rail and persists it', function (assert) {
		const sidebar = lookup(this);
		sidebar.setMobile(false);
		sidebar.toggle();
		assert.false(sidebar.open);
		assert.true(document.cookie.includes(`${COOKIE}=false`));
	});

	test('toggle on mobile drives the drawer, not the rail', function (assert) {
		const sidebar = lookup(this);
		sidebar.setMobile(true);
		const railBefore = sidebar.open;
		sidebar.toggle();
		assert.true(sidebar.openMobile);
		assert.strictEqual(
			sidebar.open,
			railBefore,
			'rail state untouched',
		);
	});

	// Growing past the breakpoint with the drawer open would otherwise leave its
	// full-screen scrim covering the desktop layout.
	test('crossing back to desktop closes the drawer', function (assert) {
		const sidebar = lookup(this);
		sidebar.setMobile(true);
		sidebar.toggle();
		assert.true(sidebar.openMobile, 'drawer open to begin with');

		sidebar.setMobile(false);
		assert.false(
			sidebar.openMobile,
			'drawer closed by the transition',
		);
	});

	test('closeMobile shuts the drawer without touching the rail', function (assert) {
		const sidebar = lookup(this);
		sidebar.setMobile(true);
		sidebar.toggle();
		sidebar.closeMobile();
		assert.false(sidebar.openMobile);
		assert.true(sidebar.open, 'rail untouched');
	});
});
