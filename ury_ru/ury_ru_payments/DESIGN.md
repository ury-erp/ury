# URY_RU_Payments — эквайринг и платежи

Приём платежей: Т-Банк, Сбер, СБП (Система быстрых платежей).

## Архитектура

Провайдерный паттерн (как Fiscal/PaymentTerminal):
`PaymentProvider` (интерфейс) → `register_payment_provider()` → `get_payment_provider()`.

Платежи строятся поверх ERPNext `Payment Request` (как в self_ordering URY).

- `payments.py` — интерфейс + реестр
- `drivers/simulated.py` — эмулятор (тесты/демо)
- `drivers/tbank.py`, `sber.py`, `sbp.py` — заглушки реальных эквайеров

## Методы провайдера

- `create_payment(invoice, amount, method)` → ссылка/QR + `payment_id`
- `get_payment_status(payment_id)` → Pending/Paid/Failed/Cancelled
- `refund(payment_id, amount)` → возврат

## Связь с фискализацией

Платёж и чек — разные вещи: эквайринг берёт деньги, фискализация печатает
чек. Порядок: оплата → фискальный чек (см. URY_RU_Fiscal). Модуль Payments
не трогает ККТ.

## Модель данных

- `URY RU Payments Settings` (singleton) — провайдер, ключи/мерчанты
- `URY RU Payment Transaction` — журнал платежей
