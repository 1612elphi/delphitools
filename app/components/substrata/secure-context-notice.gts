import type { TOC } from '@ember/component/template-only';

// navigation changes secure context
const insecure = window.isSecureContext === false;

const SecureContextNotice: TOC<object> = <template>
	{{#if insecure}}
		<div role="alert" class="sub-secure-notice">
			This needs a secure context. If your browser doesn't
			support HTTPS, you can't save. Sorry!
		</div>
	{{/if}}
</template>;

export default SecureContextNotice;
