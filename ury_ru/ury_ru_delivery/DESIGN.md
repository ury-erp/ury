# URY_RU_Delivery — агрегаторы доставки

Приём заказов из Яндекс Еды и Маркет Деливери.

## Архитектура

Провайдерный паттерн: `DeliveryProvider` → `register_delivery_provider()` →
`get_delivery_provider()`.

- `delivery.py` — интерфейс + реестр
- `drivers/simulated.py` — эмулятор
- `drivers/yandex_eda.py`, `market_delivery.py` — заглушки

## Методы провайдера

- `sync_menu()` — выгрузить меню/фид
- `fetch_orders()` — забрать новые заказы (через API или вебхук)
- `update_order_status()` / `accept_order()` / `reject_order()`

## Поток заказа

1. Агрегатор шлёт заказ (вебхук / `fetch_orders`)
2. Заказ сохраняется в `URY RU Delivery Order`
3. Конвертация в `POS Invoice` (order_type = "Aggregators" — у URY уже есть поддержка)
4. Статусы уходят обратно агрегатору

## Модель данных

- `URY RU Delivery Settings` (singleton) — агрегатор, ключи, точки/магазины
- `URY RU Delivery Order` — заказ агрегатора (внешний id, состав, статус)
