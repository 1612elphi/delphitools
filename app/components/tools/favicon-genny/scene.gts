import type { TOC } from '@ember/component/template-only';
import { IconSvg } from 'delphitools-v2/components/icon';

interface FaviconSceneSignature {
	Args: {
		tab?: string;
		touch?: string;
		app?: string;
		name?: string;
	};
}

const FaviconScene: TOC<FaviconSceneSignature> = <template>
	<div class="favicon-scene" aria-hidden="true">
		<div class="favicon-scene-group">
			<div class="favicon-browser">
				<div class="favicon-tabs">
					<span
						class="favicon-tab favicon-tab--back"
					>
						<span
							class="favicon-tab-icon"
						></span>
						<span
							class="favicon-tab-bar"
						></span>
					</span>
					<span
						class="favicon-tab favicon-tab--front"
					>
						{{#if @tab}}
							<img
								class="favicon-tab-icon"
								src={{@tab}}
								alt=""
							/>
						{{else}}
							<span
								class="favicon-tab-icon"
							></span>
						{{/if}}
						<span
							class="favicon-tab-title"
						>{{@name}}</span>
						<span
							class="favicon-tab-close"
						><IconSvg @name="x" /></span>
					</span>
				</div>
				<div class="favicon-toolbar"><span
						class="favicon-address"
					></span></div>
			</div>
			<div class="favicon-home">
				<span class="favicon-home-item">
					{{#if @touch}}
						<img
							class="favicon-touch"
							src={{@touch}}
							alt=""
						/>
					{{else}}
						<span
							class="favicon-touch"
						></span>
					{{/if}}
					<span
						class="favicon-home-name"
					>{{@name}}</span>
				</span>
				<span class="favicon-home-item">
					{{#if @app}}
						<img
							class="favicon-app"
							src={{@app}}
							alt=""
						/>
					{{else}}
						<span
							class="favicon-app"
						></span>
					{{/if}}
					<span
						class="favicon-home-name"
					>{{@name}}</span>
				</span>
			</div>
		</div>
	</div>
</template>;

export default FaviconScene;
