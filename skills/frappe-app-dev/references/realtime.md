# Realtime

Frappe uses Socket.IO for WebSocket-based realtime events. Events are routed through Redis pub/sub to Socket.IO rooms.

## Publishing events (server → client)

Room resolution follows this priority: explicit `room` > `task_id` > `user` > `doctype`+`docname` > site room (fallback).

```python
# Site-wide broadcast (all Desk users connected to this site)
# This is the fallback when no user/doctype/docname/room is specified
frappe.publish_realtime("expense_updated", {"name": "EXP-0001", "status": "Approved"})

# To a specific user (only that user's connections receive it)
frappe.publish_realtime("notification", {"message": "Approved"}, user="john@example.com")

# To a specific document room (only users who have that document open)
frappe.publish_realtime("comment_added", {"text": "Nice"},
    doctype="Expense", docname="EXP-0001")

# After commit only (event fires only if transaction succeeds)
frappe.publish_realtime("expense_created", data, after_commit=True)
```

## Room types

| Room | Who receives | When used |
|------|-------------|-----------|
| Site room (`"all"`) | All Desk users on the site | Default fallback — no `user`/`doctype`/`docname` specified |
| User room | Single user's connections | `user=` specified |
| Doc room | Users viewing that specific document | `doctype=` + `docname=` specified |
| Doctype room | Users viewing that DocType list | `list_update` event |
| Task room | Caller tracking a background task | `task_id` present |

## Listening on client

### Desk (client scripts, form scripts)

```javascript
frappe.realtime.on("expense_updated", (data) => {
    console.log(data.name, data.status);
});

frappe.realtime.off("expense_updated");
```

### Generic client (external app, custom frontend)

Connect via Socket.IO using the site URL and cookie-based auth:

```javascript
import { io } from "socket.io-client";

const socket = io("http://site.localhost:9000", {
    withCredentials: true,
    reconnectionAttempts: 5,
});

// Join a room to receive events
socket.emit("doctype_subscribe", "Expense");           // doctype list updates
socket.emit("doc_subscribe", "Expense", "EXP-0001");   // specific document updates

// Listen for events
socket.on("expense_updated", (data) => {
    console.log(data);
});

// Cleanup
socket.emit("doc_unsubscribe", "Expense", "EXP-0001");
socket.disconnect();
```

Port 9000 is the default Socket.IO port in Frappe development (`bench start`).

## Common patterns

- Use `after_commit=True` for events triggered during document saves
- Use `user=` for private notifications
- Use `doctype=` + `docname=` for document-specific updates (only users with the doc open receive it)
- Site-wide broadcasts (no `user`/`doctype`) go to all Desk users — not guests or portal users
