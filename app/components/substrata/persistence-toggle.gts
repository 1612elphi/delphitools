import Component from '@glimmer/component';
import Icon from 'delphitools-v2/components/icon';
import Switch from 'delphitools-v2/components/ui/switch';
import {
	getPersistenceEnabled,
	setPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class PersistenceToggle extends Component {
	enabled = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);

	willDestroy() {
		super.willDestroy();
		this.enabled.unsubscribe();
	}

	onChange = (checked: boolean) => {
		setPersistenceEnabled(checked);
		toast(checked ? 'saved' : 'storage-off');
	};

	<template>
		<div class="sub-persist-row">
			<Icon @name="hard-drive" class="sub-persist-icon" />
			<span class="sub-persist-label">Save in this browser</span>
			<Switch
				@checked={{this.enabled.current}}
				@onChange={{this.onChange}}
				@label="Save my work in this browser"
			/>
		</div>
	</template>
}
