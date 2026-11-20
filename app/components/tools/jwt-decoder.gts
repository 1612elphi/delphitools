import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { decodeJwt } from 'delphitools-v2/lib/jwt';
import {
	STATE_WORDS,
	jwtState,
	sampleToken,
} from 'delphitools-v2/components/tools/jwt-decoder/anatomy';
import Picture from 'delphitools-v2/components/tools/jwt-decoder/picture';
import './jwt-decoder/jwt-decoder.css';

const dash = '—';

export default class JwtDecoderTool extends Component {
	@tracked token = '';
	@tracked pictureHeight?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const sample = query.get('jwtSample');
		this.token = sample
			? sampleToken(sample, new Date())
			: (query.get('jwtToken') ?? '');
	}

	get decoding() {
		const now = new Date();
		return { now, result: decodeJwt(this.token, now) };
	}

	get decoded() {
		const { result } = this.decoding;
		return result.kind === 'decoded' ? result : undefined;
	}

	get tiles() {
		const decoded = this.decoded;
		if (!decoded) return [];
		const state = jwtState(decoded, this.decoding.now);
		return [
			{
				label: 'Algorithm',
				value:
					decoded.header.error ??
					decoded.algorithm ??
					dash,
			},
			{
				label: 'Type',
				value:
					decoded.header.error ??
					decoded.tokenType ??
					dash,
			},
			{
				label: 'Signature',
				value:
					decoded.signature.error ??
					`${decoded.signature.bytes} bytes`,
			},
			{
				label: 'Status',
				value: state ? STATE_WORDS[state] : dash,
			},
			...decoded.timeClaims.map((claim) => ({
				label: claim.label,
				value: claim.absolute,
			})),
		];
	}

	get blocks() {
		const decoded = this.decoded;
		if (!decoded) return [];
		const { header, payload, signature } = decoded;
		return [
			{
				name: 'Header',
				code: header.pretty ?? '',
				error: header.error,
			},
			{
				name: 'Payload',
				code: payload.pretty ?? '',
				error: payload.error,
			},
			{
				name: 'Signature',
				code: signature.raw,
				error: signature.error,
			},
		];
	}

	setToken = (text: string) => {
		this.token = text;
	};

	measured = (height: number) => {
		if (height + 2 !== this.pictureHeight)
			this.pictureHeight = height + 2;
	};

	<template>
		<CanonSplit
			class="jwt-decoder"
			@halves={{true}}
			@collapsesTo={{150}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Picture
						@text={{this.token}}
						@result={{this.decoding.result}}
						@now={{this.decoding.now}}
						@onInput={{this.setToken}}
						@onHeight={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					{{#if this.decoded}}
						<CanonTiles
							@items={{this.tiles}}
						/>
						{{#each this.blocks as |block|}}
							{{#if block.error}}
								<CanonHeading
									@text={{block.name}}
								/>
								<CanonStatus
									@text={{block.error}}
									@tone="warn"
									@row={{true}}
								/>
							{{else}}
								<CanonCodeBlock
									class="jwt-code"
									@code={{block.code}}
									@language={{block.name}}
								/>
							{{/if}}
						{{/each}}
					{{else}}
						<CanonEmptyRow
							@text="Paste a token here"
						/>
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
