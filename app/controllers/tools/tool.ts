import Controller from '@ember/controller';
import type { ControllerQueryParam } from '@ember/controller';

/**
 * Declares the `?color=` carry (lib/colour-query.ts) so the router keeps it
 * through a transition; an undeclared query param is dropped from the URL,
 * which left every in-app colour link landing on the tool's default. Model
 * scope: the value resets when the tool id changes instead of following the
 * user into unrelated tools. (`scope` is a documented option ember-source's
 * ControllerQueryParam type omits, hence the cast.)
 */
export default class ToolController extends Controller {
	queryParams = [
		{ color: { scope: 'model' } },
	] as unknown as ControllerQueryParam[];

	color: string | null = null;
}
