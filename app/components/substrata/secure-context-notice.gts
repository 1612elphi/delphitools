import type { TOC } from '@ember/component/template-only';

// The full capability set is in lib/substrata/capabilities.ts; only
// `isSecureContext` matters for this banner, and it cannot change without a
// navigation, so a module-level read is enough.
const insecure = window.isSecureContext === false;

/**
 * Render-gated degraded-context banner (M0-7). Returns nothing in a normal
 * secure context (https/localhost); only appears when Substrata is opened over
 * file:// or another insecure origin where Workers/OPFS/FS-Access/
 * crypto.subtle/WebGPU are unavailable. Mounted in the shell under the top
 * bar.
 */
const SecureContextNotice: TOC<object> = <template>
	{{#if insecure}}
		{{! wording carried over verbatim from the Next app }}
		<div role="alert" class="sub-secure-notice">
			This needs a secure context. If your browser doesn't
			support HTTPS, you can't save. Sorry!
		</div>
	{{/if}}
</template>;

export default SecureContextNotice;
