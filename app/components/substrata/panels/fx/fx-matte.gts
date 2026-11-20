import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonStatus from 'delphicanon/components/canon-status';
import {
	ensureMatte,
	getMatteStatus,
	matteEpoch,
	retryMatte,
	subscribeMattes,
} from 'delphitools-v2/lib/substrata/bg-removal';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import type { FxContext } from './fx-context';

export default class FxMatte extends Component<{ Args: { ctx: FxContext } }> {
	#mattes = new TrackedExternal(subscribeMattes, matteEpoch);

	get hash() {
		return this.args.ctx.layer.blobHash;
	}

	get status() {
		void this.#mattes.current;
		return getMatteStatus(this.hash);
	}

	get state() {
		return this.status?.state ?? 'queued';
	}

	get busy() {
		return this.state !== 'done' && this.state !== 'error';
	}

	get text() {
		switch (this.state) {
			case 'downloading':
				return `Downloading model... ${this.status?.progress ?? 0}%`;
			case 'processing':
				return 'Removing background...';
			case 'done':
				return 'Cutout ready';
			case 'error':
				return "Couldn't process";
			default:
				return 'Preparing…';
		}
	}

	get tone() {
		return this.state === 'error' ? 'warn' : 'muted';
	}

	get slow() {
		return this.state === 'done' && this.status?.device === 'wasm';
	}

	kick = modifier((_el: HTMLElement, [hash]: [string]) => {
		ensureMatte(hash);
	});

	retry = () => retryMatte(this.hash);

	willDestroy() {
		super.willDestroy();
		this.#mattes.unsubscribe();
	}

	<template>
		<div class="sub-fxp-matte" {{this.kick this.hash}}>
			{{#if this.busy}}<CanonLoader @cell={{5}} />{{/if}}
			<CanonStatus
				@text={{this.text}}
				@tone={{this.tone}}
				title={{this.status.detail}}
			/>
			{{#if (eqError this.state)}}
				<CanonButton
					@kind="cell"
					@text="Retry"
					@onClick={{this.retry}}
				/>
			{{/if}}
		</div>
		{{#if this.slow}}
			<div class="sub-fxp-matte-note">No graphics chip
				available, bear with me</div>
		{{/if}}
	</template>
}

function eqError(state: string) {
	return state === 'error';
}
