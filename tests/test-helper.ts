import Application from 'delphitools-v2/app';
import config from 'delphitools-v2/config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start as qunitStart, setupEmberOnerrorValidation } from 'ember-qunit';

export function start() {
	setApplication(Application.create(config.APP));

	setup(QUnit.assert);
	setupEmberOnerrorValidation();

	qunitStart();
}
