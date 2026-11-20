import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	CROP_RATIOS,
	getCropRatio,
	setCropRatio,
	subscribeCropRatio,
} from 'delphitools-v2/lib/substrata/crop-ratio';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class CropCells extends Component<{
	Args: { axis: 'row' | 'column' };
}> {
	ratio = new TrackedExternal(subscribeCropRatio, getCropRatio);

	willDestroy() {
		super.willDestroy();
		this.ratio.unsubscribe();
	}

	pick = (ratio: number | null) => setCropRatio(ratio);

	<template>
		<Cells @axis={{@axis}} @small={{true}}>
			{{#each CROP_RATIOS as |r|}}
				<Cell
					@label={{r.title}}
					@text={{r.title}}
					@selected={{eq
						this.ratio.current
						r.ratio
					}}
					aria-pressed={{if
						(eq this.ratio.current r.ratio)
						"true"
						"false"
					}}
					@onClick={{fn this.pick r.ratio}}
				/>
			{{/each}}
		</Cells>
	</template>
}
