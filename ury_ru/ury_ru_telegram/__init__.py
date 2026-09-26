"""URY_RU_Telegram — рассылка отчётов в Telegram.

Модуль собирает отчёты по продажам, клиентам, кухне и заказам и отправляет
их в Telegram-бота по расписанию.

- telegram.py — интерфейс TelegramProvider + реестр
- reports.py — сбор данных и формирование текстовых отчётов
- scheduler.py — рассылка по расписанию (scheduler_events)
- drivers/ — simulated (тесты), telegram_bot (реальный Bot API)
- doctype/ — настройки, чаты-получатели, журнал отправки

Регистрация провайдера — в ury_ru/hooks.py (по настройкам).
"""
