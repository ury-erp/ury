from . import __version__ as app_version

app_name = "ury_ru"
app_title = "URY RU"
app_publisher = "URY-RU Community"
app_description = "Russian market localization and integrations for URY"
app_email = ""
app_license = "AGPL-3.0"

# URY-RU is a companion app that layers Russian-market modules
# and integrations on top of URY (itself built on ERPNext).
required_apps = ["ury", "erpnext"]

# include js, css files in header of desk.html
# app_include_css = "/assets/ury_ru/css/ury_ru.css"
# app_include_js = ["/assets/ury_ru/js/ury_ru.js"]

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"Doctype" : "public/js/doctype.js"}
# doctype_list_js = {"Doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"Doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"Doctype" : "public/js/doctype_calendar.js"}

# Document Events
# ---------------
# Фискализация: при submit инвойса пробиваем чек, при cancel — возврат.
doc_events = {
    "POS Invoice": {
        "on_submit": "ury_ru.ury_ru_fiscal.fiscal_hooks.on_submit",
        "on_cancel": "ury_ru.ury_ru_fiscal.fiscal_hooks.on_cancel",
    },
}

# Fixtures: RU-specific customizations that can be exported/imported.
# fixtures = []

# Scheduled tasks: периодический обмен с 1С + отчёты/аналитика.
scheduler_events = {
    "cron": {
        "*/5 * * * *": [
            "ury_ru.ury_ru_1c.sync.run_sync_if_due",
            "ury_ru.ury_ru_telegram.scheduler.run_daily_report"
        ],
        "0 3 * * *": [
            "ury_ru.ury_ru_deepseek.scheduler.run_daily_analysis"
        ]
    }
}


def _register_provider(settings_doctype, field, factory_map, register_fn):
    """Общий хелпер: регистрирует провайдер по выбранному в настройках имени."""
    import frappe

    if not frappe.db.exists(settings_doctype, settings_doctype):
        return
    settings = frappe.get_doc(settings_doctype, settings_doctype)
    selected = (settings.get(field) or "").lower()
    factory = factory_map.get(selected)
    if factory:
        register_fn(factory())


def register_providers_default():
    """Регистрирует провайдеры всех RU-модулей по настройкам.

    Вызывается при старте (напр. из after_install / bench restart).
    По умолчанию во всех модулях стоит честный NoOp — реальный/simulated
    провайдер подключается только если выбран в настройках модуля.
    """
    # 1С
    _register_provider(
        "URY RU 1C Settings", "provider",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_1c.drivers.simulated", fromlist=["SimulatedOneCProvider"]
            ).SimulatedOneCProvider(),
        },
        __import__("ury_ru.ury_ru_1c.one_c", fromlist=["register_1c_provider"]).register_1c_provider,
    )
    # Фискализация
    _register_provider(
        "URY RU Fiscal Settings", "driver",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_fiscal.drivers.simulated", fromlist=["SimulatedFiscalDriver"]
            ).SimulatedFiscalDriver(),
        },
        __import__("ury_ru.ury_ru_fiscal.fiscal_driver", fromlist=["register_fiscal_driver"]).register_fiscal_driver,
    )
    # Платежи
    _register_provider(
        "URY RU Payments Settings", "provider",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_payments.drivers.simulated", fromlist=["SimulatedPaymentProvider"]
            ).SimulatedPaymentProvider(),
        },
        __import__("ury_ru.ury_ru_payments.payments", fromlist=["register_payment_provider"]).register_payment_provider,
    )
    # Доставка
    _register_provider(
        "URY RU Delivery Settings", "aggregator",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_delivery.drivers.simulated", fromlist=["SimulatedDeliveryProvider"]
            ).SimulatedDeliveryProvider(),
        },
        __import__("ury_ru.ury_ru_delivery.delivery", fromlist=["register_delivery_provider"]).register_delivery_provider,
    )
    # Маркировка
    _register_provider(
        "URY RU Marking Settings", "provider",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_marking.drivers.simulated", fromlist=["SimulatedMarkingProvider"]
            ).SimulatedMarkingProvider(),
        },
        __import__("ury_ru.ury_ru_marking.marking", fromlist=["register_marking_provider"]).register_marking_provider,
    )
    # ЕГАИС
    _register_provider(
        "URY RU EGAIS Settings", "provider",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_egais.drivers.simulated", fromlist=["SimulatedEgaisProvider"]
            ).SimulatedEgaisProvider(),
        },
        __import__("ury_ru.ury_ru_egais.egais", fromlist=["register_egais_provider"]).register_egais_provider,
    )
    # Меркурий
    _register_provider(
        "URY RU Mercury Settings", "provider",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_mercury.drivers.simulated", fromlist=["SimulatedMercuryProvider"]
            ).SimulatedMercuryProvider(),
        },
        __import__("ury_ru.ury_ru_mercury.mercury", fromlist=["register_mercury_provider"]).register_mercury_provider,
    )
    # Deepseek (ИИ-аналитика)
    _register_provider(
        "URY RU Deepseek Settings", "provider",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_deepseek.drivers.simulated", fromlist=["SimulatedDeepseekProvider"]
            ).SimulatedDeepseekProvider(),
            "deepseek_api": lambda: __import__(
                "ury_ru.ury_ru_deepseek.drivers.deepseek_api", fromlist=["DeepseekApiProvider"]
            ).DeepseekApiProvider(),
        },
        __import__("ury_ru.ury_ru_deepseek.deepseek", fromlist=["register_deepseek_provider"]).register_deepseek_provider,
    )
    # Telegram (рассылка отчётов)
    _register_provider(
        "URY RU Telegram Settings", "provider",
        {
            "simulated": lambda: __import__(
                "ury_ru.ury_ru_telegram.drivers.simulated", fromlist=["SimulatedTelegramProvider"]
            ).SimulatedTelegramProvider(),
            "telegram_bot": lambda: __import__(
                "ury_ru.ury_ru_telegram.drivers.telegram_bot", fromlist=["TelegramBotProvider"]
            ).TelegramBotProvider(),
        },
        __import__("ury_ru.ury_ru_telegram.telegram", fromlist=["register_telegram_provider"]).register_telegram_provider,
    )


def register_fiscal_driver_default():
    """Регистрирует фискальный драйвер при старте по настройкам.

    По умолчанию — NoOp (честная ошибка). Simulated включается в тестах/демо
    явно через URY RU Fiscal Settings (driver = "Simulated").
    """
    import frappe
    from ury_ru.ury_ru_fiscal.fiscal_driver import (
        register_fiscal_driver,
    )

    if not frappe.db.exists("URY RU Fiscal Settings", "URY RU Fiscal Settings"):
        return

    settings = frappe.get_doc("URY RU Fiscal Settings", "URY RU Fiscal Settings")
    driver_name = (settings.get("driver") or "").lower()

    if driver_name == "simulated":
        from ury_ru.ury_ru_fiscal.drivers.simulated import (
            SimulatedFiscalDriver,
        )
        register_fiscal_driver(SimulatedFiscalDriver())
    # ATOL / Shtrih-M — регистрируются только после реальной реализации,
    # пока NoOpFiscalDriver остаётся активным по умолчанию.
