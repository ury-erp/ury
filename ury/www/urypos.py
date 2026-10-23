from ury.brand import get_brand_context

no_cache = 1


def get_context(context):
	context.update(get_brand_context())
	return context
