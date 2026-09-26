"""Эмулятор Telegram для тестов/демо.

Никогда не регистрируется по умолчанию. Пишет строку в URY RU Telegram Log
и возвращает фиктивный message_id — без вызова Bot API.
"""

import frappe

from ury_ru.ury_ru_telegram.telegram import TelegramProvider


class SimulatedTelegramProvider(TelegramProvider):
	name = "simulated"

	def send_message(self, chat_id, text):
		return {"message_id": 0, "simulated": True}
