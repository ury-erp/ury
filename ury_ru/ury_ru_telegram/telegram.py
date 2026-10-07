"""Telegram: провайдер + реестр.

Провайдерный паттерн как у остальных RU-модулей. Провайдер отвечает только
за доставку сообщения в Telegram; сбор данных — в reports.py.
"""

import frappe
from frappe import _


class TelegramProvider:
	"""Абстрактный интерфейс отправки сообщений в Telegram."""

	name = "abstract"

	def send_message(self, chat_id, text):
		"""Отправить текстовое сообщение в чат.

		:param chat_id: str или int — id чата/канала/пользователя
		:param text: str — текст сообщения (HTML/простой)
		:return: dict {"message_id": int}
		"""
		raise NotImplementedError


class NoOpTelegramProvider(TelegramProvider):
	"""По умолчанию: честная ошибка вместо молчаливого бездействия."""

	name = "noop"

	def send_message(self, chat_id, text):
		frappe.throw(
			_("Telegram не настроен. Укажите провайдера в URY RU Telegram Settings."),
			frappe.ValidationError,
		)


_telegram_provider = NoOpTelegramProvider()


def register_telegram_provider(provider):
	global _telegram_provider
	if not isinstance(provider, TelegramProvider):
		frappe.throw(_("Telegram-провайдер должен наследовать TelegramProvider"))
	_telegram_provider = provider


def get_telegram_provider():
	return _telegram_provider
