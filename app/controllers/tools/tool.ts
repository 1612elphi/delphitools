import Controller from '@ember/controller';
import type { ControllerQueryParam } from '@ember/controller';

/** model-scoped color query */
export default class ToolController extends Controller {
	// ember type omits scope
	queryParams = [
		{ color: { scope: 'model' } },
	] as unknown as ControllerQueryParam[];

	color: string | null = null;
}
