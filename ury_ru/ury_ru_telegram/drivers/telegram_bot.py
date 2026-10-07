"""Драйвер Telegram Bot API (реальный HTTP-клиент).

Отправляет сообщения через Bot API: POST https://api.telegram.org/bot<token>/sendMessage.
Токен берётся из URY RU Telegram Settings.
"""

import frappe
import requests
from frappe import _

from ury_ru.ury_ru_telegram.telegram import TelegramProvider


class TelegramBotProvider(TelegramProvider):
	name = "telegram_bot"

	def __init__(self, token=None):
		settings = frappe.get_cached_doc("URY RU Telegram Settings")
		self.token = token or settings.get_password("bot_token") or None

	def send_message(self, chat_id, text):
		if not self.token:
			frappe.throw(
				_("Не задан токен бота в URY RU Telegram Settings."),
				frappe.ValidationError,
			)
		resp = requests.post(
			f"https://api.telegram.org/bot{self.token}/sendMessage",
			json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
			timeout=30,
		)
		if resp.status_code != 200 or not resp.json().get("ok"):
			frappe.throw(
				_("Telegram API вернул ошибку: {0}").format(resp.text[:300]),
				frappe.ValidationError,
			)
		return resp.json()["result"]
