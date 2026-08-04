# Caching

`frappe.cache` is a Redis wrapper that auto-prefixes keys with the current site name.

## Basic operations

```python
# Set with TTL (preferred for ephemeral state)
frappe.cache.set_value("presence:user1", {"status": "online"}, expires_in_sec=300)

# Set without TTL (persistent until cleared)
frappe.cache.set_value("config:feature_flags", {"beta": True})

# Get
value = frappe.cache.get_value("presence:user1")

# Delete
frappe.cache.delete_value("presence:user1")

# Delete multiple
frappe.cache.delete_value(["key1", "key2"])
```

## Key patterns

Pass logical keys (e.g. `presence:user1`). The wrapper handles site-prefixing automatically. Do NOT manually prefix with database name.

## Listing keys

```python
# Get keys matching a prefix
keys = frappe.cache.get_keys("presence:")

# Count active keys
count = len(frappe.cache.get_keys("presence:"))
```

`get_keys` returns raw Redis keys (with site prefix). Safe for counting. Do NOT compare directly to unprefixed logical keys.

## When to use cache

- **Session/presence data** — TTL-backed, short-lived
- **Expensive computed values** — cache with TTL to avoid recomputation
- **Cross-request coordination** — flags, locks, counters

## When NOT to use cache

- **Persistent data** — use the database
- **User-specific state** — use `frappe.session` or documents
- **Large objects** — Redis is not a blob store
