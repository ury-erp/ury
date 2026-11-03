"""Grant URY roles access to the URY Insights dashboards (idempotent, reversible).

Runs in [post_model_sync]. No-op unless the `insights` app is installed.
All logic lives in ury.ury.analytics_access; undo with
`ury.ury.analytics_access.revert()`.
"""


def execute():
	from ury.ury import analytics_access

	analytics_access.apply()
