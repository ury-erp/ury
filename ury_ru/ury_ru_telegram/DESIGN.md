# URY_RU_Telegram — рассылка отчётов в Telegram

Отправка сводных отчётов (продажи, клиенты, кухня, заказы) в Telegram-бота
по расписанию.

## Функции

- **Продажи** — выручка, число чеков, средний чек
- **Клиенты** — уникальные, топ по выручке
- **Кухня** — число KOT, среднее время производства
- **Заказы** — разбивка по типам заказа

## Архитектура

Провайдерный паттерн (как 1C/Fiscal):

`TelegramProvider` (интерфейс) → `register_telegram_provider()` → `get_telegram_provider()`.

- `telegram.py` — интерфейс + реестр (NoOp по умолчанию)
- `reports.py` — сбор данных и формирование текста (HTML-разметка)
- `scheduler.py` — рассылка по расписанию
- `drivers/simulated.py` — эмулятор (тесты)
- `drivers/telegram_bot.py` — реальный Bot API (sendMessage)

## Модель данных

- `URY RU Telegram Settings` (singleton) — провайдер, токен, расписание, секции
- `URY RU Telegram Chat` (table) — чаты-получатели (chat_id)
- `URY RU Telegram Log` — журнал отправки (статус/ошибка)

## Расписание

Через `scheduler_events` в `ury_ru/hooks.py`. Периодичность — из настроек.
