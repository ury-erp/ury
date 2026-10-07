<div align="center">

# URY-RU 🍽️

**Открытая система управления рестораном для российского рынка**
*Open-source restaurant management system for the Russian market*
Описание проекта https://habr.com/ru/articles/1073824/
Базируется на [URY](https://github.com/ury-erp/ury) · ERPNext · Frappe Framework

</div>

---

## О проекте / About

**URY-RU** — форк открытой системы управления рестораном [URY](https://github.com/ury-erp/ury) (построена на базе [ERPNext](https://erpnext.com) и [Frappe Framework](https://frappeframework.com)), адаптированный под российский рынок.

Основная цель — создать открытый аналог **iiko**, не уступающий по функционалу, с поддержкой обязательных российских интеграций: 1С, фискализация (54-ФЗ), эквайринг, агрегаторы доставки, «Честный знак», ЕГАИС и «Меркурий».

**URY-RU** is a fork of the open-source restaurant management system [URY](https://github.com/ury-erp/ury) (built on [ERPNext](https://erpnext.com) and [Frappe Framework](https://frappeframework.com)), adapted for the Russian market.

The goal is an open-source alternative to **iiko** with full support for mandatory Russian integrations: 1C, fiscalization (54-FZ), acquiring, delivery aggregators, Chestny Znak, EGAIS and Mercury.

> ⚠️ Проект в активной разработке. Обратная совместимость до стабильного релиза не гарантируется.
> ⚠️ The project is under active development. Backward compatibility is not guaranteed until a stable release.

---

## Что внутри / What's inside

URY — монорепо из нескольких приложений / a monorepo of several apps:

| Директория / Directory | Назначение / Purpose |
|---|---|
| `ury/` | Основное Frappe-приложение: POS, KDS, отчёты, API / Core Frappe app: POS, KDS, reports, API |
| `pos/` | POS-фронтенд (Vite/React) / POS frontend |
| `mosaic/` | Kitchen Display System (KDS) |
| `self-order/` | Самообслуживание (QR-меню) / Self-ordering (QR menu) |
| `urypos/` | Устаревший POS (legacy) / Legacy POS |
| `packages/` | Общие core/ui пакеты / Shared core/ui packages |
| **`ury_ru/`** | **🇷🇺 Российская локализация и интеграции / Russian localization & integrations** |

### Модули `ury_ru` / `ury_ru` modules

7 изолированных Frappe-модулей, каждый подключается через `hooks.py` / 7 isolated Frappe modules, each wired via `hooks.py`:

| Модуль / Module | Назначение / Purpose | Интеграции / Integrations |
|---|---|---|
| `URY_RU_1C` | Обмен с 1С / 1C exchange | 1С:Предприятие (CommerceML / REST / файлы) |
| `URY_RU_Fiscal` | Фискализация / Fiscalization | АТОЛ, ШТРИХ-М, ОФД, 54-ФЗ |
| `URY_RU_Payments` | Эквайринг / Acquiring | Т-Банк, Сбер, СБП |
| `URY_RU_Delivery` | Доставка / Delivery | Яндекс Еда, Маркет Деливери |
| `URY_RU_Marking` | Маркировка / Product marking | «Честный знак» |
| `URY_RU_EGAIS` | Алкоголь / Alcohol | ЕГАИС |
| `URY_RU_Mercury` | Ветконтроль / Veterinary control | «Меркурий» |

По умолчанию во всех модулях активен честный **NoOp**-провайдер; реальный или simulated-драйвер подключается только после выбора в настройках модуля.
By default every module uses an honest **NoOp** provider; the real or simulated driver is only activated when selected in the module's settings.

---

## Возможности URY / URY features

- **POS** — зал, на вынос, доставка, офлайн-режим, управление принтерами
- **Kitchen Display (MOSAIC)** — живые очереди заказов, печать KOT
- **Аналитика** — P&L-дашборд, отчёты по расходу, тренды по позициям
- **Меню и техкарты** — централизованное меню, рецепты через BOM, комбо и модификаторы
- **Столы** — визуальное управление залом, merge/split счетов
- **Мультикассир, смены, сверка наличных**

Подробнее — [FEATURES.md](FEATURES.md). Дорожная карта — [ROADMAP.md](ROADMAP.md).

---

## Установка / Installation

### Требования / Requirements

- Frappe Bench + [ERPNext v15](https://github.com/frappe/erpnext) (`version-15`)
- [Frappe HR](https://github.com/frappe/hrms) (для отчётов по сотрудникам)
- Node.js ≥ 18

### Шаги / Steps

```bash
# 1. Получить приложения
bench get-app --branch version-15 erpnext https://github.com/frappe/erpnext.git
bench get-app --branch version-15 hrms https://github.com/frappe/hrms.git
bench get-app ury https://github.com/ury-erp/ury.git
bench get-app ury_ru https://github.com/webzuweb/URY-RU.git

# 2. Создать сайт и установить приложения
bench new-site <sitename>
bench --site <sitename> install-app erpnext
bench --site <sitename> install-app hrms
bench --site <sitename> install-app ury
bench --site <sitename> install-app ury_ru

# 3. Собрать и мигрировать
bench --site <sitename> build
bench --site <sitename> migrate
```

> ⚠️ Приложение `ury_ru` зависит от `ury` и `erpnext` — устанавливайте их в указанном порядке.
> ⚠️ `ury_ru` requires `ury` and `erpnext` — install in the order above.

Подробная инструкция по настройке ресторана — [SETUP.md](SETUP.md) (англ.) / см. [INSTALLATION.md](INSTALLATION.md).

---

## Разработка / Development

Правила / Rules (подробно в [ROADMAP.md](ROADMAP.md)):

- Код RU-локализации **не меняет** файлы апстрима `ury/` без необходимости — всё новое в `ury_ru/`.
- Каждый модуль изолирован: настройки в отдельном `Doctype Settings`, подключение через `hooks.py`.
- Периодически синхронизировать `upstream/develop`.
- RU-localization code **does not modify** upstream `ury/` unless necessary — everything new lives in `ury_ru/`.
- Each module is isolated: its own `Doctype Settings`, wired through `hooks.py`.

---

## Лицензия / License

[AGPL-3.0](LICENSE) — та же лицензия, что и у апстрима URY / same license as upstream URY.

---

## Авторство / Credits

Апстрим URY разработан [Tridz Technologies Pvt Ltd](https://tridz.com) при поддержке [Frappe](http://frappe.io). URY-RU — форк и адаптация для РФ.

Upstream URY is developed by [Tridz Technologies Pvt Ltd](https://tridz.com) and supported by [Frappe](http://frappe.io). URY-RU is a fork adapted for Russia.

[Terms / Условия](TERMS.md)
