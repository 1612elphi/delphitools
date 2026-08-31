import Controller from '@ember/controller';
import type { ControllerQueryParam } from '@ember/controller';

/** model-scoped colour carry params */
export default class ToolController extends Controller {
	// ember type omits scope
	queryParams = [
		{ color: { scope: 'model' } },
		{ colors: { scope: 'model' } },
	] as unknown as ControllerQueryParam[];

	color: string | null = null;
	colors: string | null = null;
}
