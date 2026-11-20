import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextArea from 'delphicanon/components/canon-text-area';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	METHODS,
	fullUrl,
	toCurl,
	toHttp,
	type RequestSpec,
} from 'delphitools-v2/lib/request-builder';
import Pairs, {
	PairRow,
} from 'delphitools-v2/components/tools/request-builder/pairs';
import Picture from 'delphitools-v2/components/tools/request-builder/picture';
import './request-builder/request-builder.css';

const methods = [...METHODS];

export default class RequestBuilderTool extends Component {
	@tracked method = 0;
	@tracked url = '';
	@tracked params: PairRow[] = [];
	@tracked headers: PairRow[] = [];
	@tracked body = '';

	constructor(owner: Owner, args: object) {
		super(owner, args);
		if (
			new URLSearchParams(window.location.search).get(
				'reqSample',
			)
		) {
			this.method = methods.indexOf('POST');
			this.url = 'https://api.example.com/v1/notes?draft=1';
			this.params = [new PairRow('tag', 'work & play')];
			this.headers = [
				new PairRow('Content-Type', 'application/json'),
				new PairRow('Accept', 'application/json'),
				new PairRow('Authorization', 'Bearer 3f9a0c…'),
			];
			this.body =
				'{\n  "title": "Standup",\n  "pinned": true\n}';
		}
	}

	get spec(): RequestSpec {
		const pairs = (rows: PairRow[]) =>
			rows.map((row) => ({ key: row.key, value: row.value }));
		return {
			method: methods[this.method] ?? 'GET',
			url: this.url,
			params: pairs(this.params),
			headers: pairs(this.headers),
			body: this.body,
		};
	}

	get target() {
		return fullUrl(this.spec) || null;
	}

	get curl() {
		return toCurl(this.spec);
	}

	get http() {
		return toHttp(this.spec);
	}

	setMethod = (index: number) => {
		this.method = index;
	};

	setUrl = (value: string) => {
		this.url = value;
	};

	setParams = (rows: PairRow[]) => {
		this.params = rows;
	};

	setHeaders = (rows: PairRow[]) => {
		this.headers = rows;
	};

	setBody = (value: string) => {
		this.body = value;
	};

	<template>
		<CanonSplit class="request-builder">
			<:banner>
				<CanonCanvas
					@fitting={{true}}
					@animated={{true}}
				>
					<Picture @message={{this.http}} />
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Method" />
					<CanonSegmented
						@items={{methods}}
						@selected={{this.method}}
						@columns={{4}}
						@onChange={{this.setMethod}}
						aria-label="Method"
					/>
					<CanonHeading @text="URL" />
					<CanonTextCell
						class="rq-url"
						type="url"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						@value={{this.url}}
						@placeholder="https://api.example.com/path"
						@onChange={{this.setUrl}}
						aria-label="URL"
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Query" />
					<Pairs
						@rows={{this.params}}
						@keyName="Name"
						@label="Query"
						@onChange={{this.setParams}}
					/>
					<CanonHeading @text="Headers" />
					<Pairs
						@rows={{this.headers}}
						@keyName="Header"
						@label="Headers"
						@onChange={{this.setHeaders}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Body" />
					<CanonTextArea
						class="rq-body"
						spellcheck="false"
						@value={{this.body}}
						@placeholder="{ }"
						@height={{140}}
						@onChange={{this.setBody}}
						aria-label="Body"
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="URL" />
					<CanonValueLine
						class="rq-target"
						@layout="wrapping"
						@label={{this.spec.method}}
						@value={{this.target}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="cURL" />
					<CanonCodeBlock
						class="rq-code"
						@code={{this.curl}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="HTTP" />
					<CanonCodeBlock
						class="rq-code"
						@code={{this.http}}
					/>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
