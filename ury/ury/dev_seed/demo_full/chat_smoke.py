import frappe, json
from ury.ury.api import ury_chat
def run():
    frappe.set_user("Administrator")
    c = ury_chat.get_or_create_conversation()
    cid = c.get("conversation_id") or c.get("name") if isinstance(c, dict) else c
    r = ury_chat.send_chat_message(cid, "Which reports do you have? One line answer.")
    print(json.dumps(r, default=str)[:800])
