import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonSheet from 'delphicanon/components/canon-sheet';
import AboutDelphitoolsBody from 'delphitools-v2/components/about-delphitools';
import { VERSION } from 'delphitools-v2/lib/build-flags';
import { ensureScene } from 'delphitools-v2/lib/substrata/file-ops';
import {
	closeModal,
	getOpenModal,
	subscribeModal,
} from 'delphitools-v2/lib/substrata/modal';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import CanvasSizeForm from './canvas-size-form';
import FormPopover from './form-popover';
import Onboarding from './onboarding';
import RenameForm from './rename-form';
import Shortcuts from './shortcuts';
import StrataHelp from './strata-help';
import { anchorFor, pageState } from './page-state';
import './pages.css';

export default class Sheets extends Component<{ Args: { phone: boolean } }> {
	open = new TrackedExternal(subscribeModal, getOpenModal);

	willDestroy() {
		super.willDestroy();
		this.open.unsubscribe();
		closeModal();
	}

	is = (id: string) => this.open.current === id;

	anchor = () => anchorFor('Menu', pageState.anchor);

	done = () => {
		pageState.anchor = null;
		closeModal();
	};

	created = () => {
		this.done();
		editorUi.galleryOpen = false;
	};

	closeIf = (id: string) => () => {
		if (this.open.current === id) this.done();
	};

	closeNew = () => {
		if (this.open.current !== 'new-scene') return;
		this.done();
		ensureScene();
	};

	closeRename = () => {
		pageState.anchor = null;
		pageState.closeRename();
	};

	<template>
		<FormPopover
			@open={{this.is "canvas-size"}}
			@phone={{@phone}}
			@label="Canvas Size"
			@anchor={{this.anchor}}
			@onClose={{this.closeIf "canvas-size"}}
		>
			<CanvasSizeForm @onDone={{this.done}} />
		</FormPopover>
		<FormPopover
			@open={{this.is "new-scene"}}
			@phone={{@phone}}
			@label="New"
			@anchor={{this.anchor}}
			@placement={{if pageState.anchor "top" "left-start"}}
			@onClose={{this.closeNew}}
		>
			<CanvasSizeForm
				@new={{true}}
				@onDone={{this.created}}
			/>
		</FormPopover>
		<FormPopover
			@open={{if pageState.rename true false}}
			@phone={{@phone}}
			@label="Rename"
			@anchor={{this.anchor}}
			@placement="bottom"
			@onClose={{this.closeRename}}
		>
			{{#if pageState.rename}}
				<RenameForm
					@target={{pageState.rename}}
					@onDone={{this.closeRename}}
				/>
			{{/if}}
		</FormPopover>
		<Onboarding @open={{this.is "onboarding"}} @phone={{@phone}} />
		<StrataHelp
			@open={{this.is "strata-help"}}
			@phone={{@phone}}
			@onClose={{this.closeIf "strata-help"}}
		/>
		{{#let (if @phone CanonSheet CanonDialog) as |Frame|}}
			<Frame
				class="sub-pg-dialog"
				@open={{this.is "shortcuts"}}
				@title="Keyboard shortcuts"
				@onClose={{this.closeIf "shortcuts"}}
			>
				<Shortcuts />
			</Frame>
			<Frame
				class="sub-pg-dialog"
				@open={{this.is "about-substrata"}}
				@title="About Substrata"
				@onClose={{this.closeIf "about-substrata"}}
			>
				<div class="sub-pg-about">
					<p>v{{VERSION}}</p>
					<p>
						Substrata is a simple,
						uncomplicated image editor for
						the browser, based on Fabric.JS.
					</p>
					<LinkTo
						@route="index"
					>delphitools</LinkTo>
				</div>
			</Frame>
			<Frame
				class="sub-pg-dialog is-wide"
				@open={{this.is "about-delphitools"}}
				@title="About delphitools"
				@onClose={{this.closeIf "about-delphitools"}}
			>
				<div class="sub-pg-about"><AboutDelphitoolsBody
					/></div>
			</Frame>
		{{/let}}
	</template>
}
