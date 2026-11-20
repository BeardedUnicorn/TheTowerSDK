import { sdkStats } from '$lib/sdk-stats';

/** Build-time only — keeps `@beardedunicorn/thetowersdk/data` out of the docs client bundle. */
export function load() {
	return {
		chartableSeries: sdkStats.chartableSeries
	};
}
