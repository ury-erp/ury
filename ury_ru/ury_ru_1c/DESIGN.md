# URY_RU_1C — обмен с 1С

Двусторонний обмен данными между URY и «1С:Предприятие».

## Объём обмена

**Из 1С → URY:**
- Номенклатура (товары, группы, штрихкоды, ед. изм.)
- Цены (прайс-листы)
- Остатки по складам

**Из URY → 1С:**
- Заказы/продажи (POS Invoice)
- Выручка/закрытие смены

## Транспорт

| Режим | Описание |
|-------|----------|
| `File` | CommerceML 2 (import.xml / offers.xml), каталог обмена |
| `HTTP` | REST/веб-сервисы 1С |

## Архитектура

Провайдерный паттерн (как Fiscal/PaymentTerminal):
`OneCProvider` (интерфейс) → `register_1c_provider()` → `get_1c_provider()`.

- `one_c.py` — интерфейс + реестр
- `drivers/simulated.py` — эмулятор (тесты/демо)
- `drivers/commerceml.py` — заглушка CommerceML 2

## Модель данных

- `URY RU 1C Settings` (singleton) — провайдер, режим, каталог/URL, периодичность
- `URY RU 1C Warehouse Map` — маппинг складов 1С ↔ URY
- `URY RU 1C Sync Log` — журнал операций

## Синхронизация

Через `scheduler_events` в `ury_ru/hooks.py` (периодичность из настроек).
Каждая операция пишет строку в Sync Log.
