import frappe
from frappe import _
from functools import wraps
import json
import pytz
from datetime import datetime
from dateutil.relativedelta import relativedelta

from frappe.desk.page.setup_wizard.setup_wizard import (
    load_languages,
    load_country,
    update_system_settings,
    create_or_update_user,
)
from erpnext.setup.setup_wizard.setup_wizard import setup_complete as erpnext_setup_complete
from frappe.geo.country_info import get_country_info, get_all
from erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts import get_charts_for_country
from frappe.auth import LoginManager
from frappe.utils import getdate, nowdate


def check_setup_lock():
    if frappe.db.get_single_value('System Settings', 'setup_complete'):
        frappe.throw(_('Setup has already been completed.'), frappe.PermissionError)


def setup_api(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        check_setup_lock()
        original_user = frappe.session.user
        frappe.set_user('Administrator')
        frappe.flags.ignore_permissions = True
        try:
            return fn(*args, **kwargs)
        finally:
            frappe.flags.ignore_permissions = False
            if frappe.session.user == 'Administrator' and original_user:
                frappe.set_user(original_user)
    return wrapper


@frappe.whitelist()
def get_setup_defaults():
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    languages = load_languages()
    country_data = load_country()
    if isinstance(country_data, str):
        detected_country = country_data
    elif isinstance(country_data, dict):
        detected_country = country_data.get('country', '')
    else:
        detected_country = ''

    if not detected_country:
        detected_country = frappe.db.get_single_value('System Settings', 'country') or 'India'

    countries_dict = get_all()
    countries = list(countries_dict.keys())

    currencies_set = set()
    currencies = []

    timezones = pytz.all_timezones

    for c_name, c_info in countries_dict.items():
        if 'currency' in c_info:
            curr = c_info['currency']
            if curr not in currencies_set:
                currencies_set.add(curr)
                currencies.append({
                    'value': curr,
                    'label': f'{curr}',
                    'symbol': c_info.get('currency_symbol', '')
                })

    return {
        'languages': languages,
        'detected_country': detected_country,
        'countries': countries,
        'currencies': currencies,
        'timezones': timezones
    }


@frappe.whitelist()
def get_country_defaults(country):
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    country_info = get_country_info(country)

    currency = country_info.get('currency')
    timezone = country_info.get('timezones', [None])[0] if country_info.get('timezones') else None

    charts = get_charts_for_country(country, with_standard=True)

    charts_of_accounts = []
    for chart in charts:
        charts_of_accounts.append({
            'value': chart,
            'label': chart
        })

    return {
        'currency': currency,
        'timezone': timezone,
        'charts_of_accounts': charts_of_accounts
    }


@frappe.whitelist(allow_guest=True, methods=['POST', 'GET'])
@setup_api
def setup_organization(**kwargs):
    data = frappe._dict(kwargs)
    if 'payload' in data:
        payload_val = data.pop('payload')
        if isinstance(payload_val, str):
            data.update(json.loads(payload_val))
        elif isinstance(payload_val, dict):
            data.update(payload_val)

    if not data.get('company_name'):
        data.company_name = data.get('business_name')
    if not data.get('abbr'):
        data.abbr = data.get('company_abbr') or data.get('abbreviation')
    if not data.get('user_name'):
        data.user_name = data.get('full_name') or (frappe.session.user if frappe.session.user != 'Guest' else 'Administrator')
    if not data.get('email'):
        if frappe.session.user and frappe.session.user != 'Guest':
            data.email = frappe.db.get_value('User', frappe.session.user, 'email') or frappe.session.user
            if data.email == 'Administrator':
                data.email = 'admin@example.com'
        else:
            data.email = 'admin@example.com'
    if not data.get('password'):
        data.password = data.get('admin_password') or 'admin'

    required_fields = ['company_name', 'abbr', 'country', 'currency']
    for field in required_fields:
        if not data.get(field):
            frappe.throw(_('Missing field: {0}').format(field))

    fy_start_input = data.get('fy_start_date')
    if fy_start_input:
        if len(str(fy_start_input)) == 5:
            current_year = datetime.today().year
            fy_start_str = f'{current_year}-{fy_start_input}'
        else:
            fy_start_str = str(fy_start_input)
        try:
            fy_start_dt = datetime.strptime(fy_start_str, '%Y-%m-%d')
            fy_end_dt = fy_start_dt + relativedelta(months=12, days=-1)
            fy_start = fy_start_dt.strftime('%Y-%m-%d')
            fy_end = fy_end_dt.strftime('%Y-%m-%d')
        except Exception:
            today = getdate(nowdate())
            fy_start = f'{today.year}-04-01' if today.month >= 4 else f'{today.year-1}-04-01'
            fy_end = f'{today.year+1}-03-31' if today.month >= 4 else f'{today.year}-03-31'
    else:
        today = getdate(nowdate())
        if today.month >= 4:
            fy_start = f'{today.year}-04-01'
            fy_end = f'{today.year+1}-03-31'
        else:
            fy_start = f'{today.year-1}-04-01'
            fy_end = f'{today.year}-03-31'

    args = frappe._dict({
        'company_name': data.company_name,
        'company_abbr': data.abbr,
        'country': data.country,
        'currency': data.currency,
        'timezone': data.get('timezone', 'Asia/Kolkata'),
        'language': data.get('language', 'English'),
        'full_name': data.user_name,
        'email': data.email,
        'password': data.password,
        'chart_of_accounts': data.get('chart_of_accounts', 'Standard'),
        'fy_start_date': fy_start,
        'fy_end_date': fy_end,
        'domain': data.get('domain', 'Services'),
        'set_default': 1
    })

    update_system_settings(args)
    create_or_update_user(args)

    if frappe.db.exists('User', data.email):
        user = frappe.get_doc('User', data.email)
        roles = frappe.get_all('Role', filters={'disabled': 0, 'is_custom': 0}, pluck='name')
        for target_role in ['URY Cashier', 'Cashier']:
            if frappe.db.exists('Role', target_role) and target_role not in roles:
                roles.append(target_role)

        for role in roles:
            if role not in ['Guest', 'All', 'Employee'] and role not in [r.role for r in user.roles]:
                user.append('roles', {'role': role})
        user.save(ignore_permissions=True)

    erpnext_setup_complete(args)

    if not frappe.db.exists('Branch', data.company_name):
        branch = frappe.new_doc('Branch')
        branch.branch = data.company_name
        branch.insert(ignore_permissions=True)

    default_room_name = f'Default Room - {data.abbr}'
    if not frappe.db.exists('URY Room', default_room_name):
        room = frappe.new_doc('URY Room')
        room.name = default_room_name
        room.branch = data.company_name
        room.insert(ignore_permissions=True)

    if not frappe.db.exists('URY Restaurant', data.company_name):
        restaurant = frappe.new_doc('URY Restaurant')
        restaurant.name = data.company_name
        restaurant.company = data.company_name
        restaurant.branch = data.company_name
        restaurant.default_room = default_room_name
        restaurant.invoice_series_prefix = f'{data.abbr}-POS-'
        restaurant.insert(ignore_permissions=True)

    pos_profile_name = f'Default Profile - {data.abbr}'
    if not frappe.db.exists('POS Profile', pos_profile_name):
        pos_profile = frappe.new_doc('POS Profile')
        pos_profile.name = pos_profile_name
        pos_profile.company = data.company_name
        pos_profile.currency = data.currency
        pos_profile.branch = data.company_name
        pos_profile.restaurant = data.company_name

        pos_profile.append('applicable_for_users', {
            'user': data.email,
            'default': 1
        })

        if frappe.db.exists('Mode of Payment', 'Cash'):
            pos_profile.append('payments', {
                'mode_of_payment': 'Cash',
                'default': 1
            })

        cost_center = frappe.get_all('Cost Center', filters={'company': data.company_name, 'is_group': 0}, skip_permissions=True, limit=1)
        if cost_center:
            pos_profile.write_off_cost_center = cost_center[0].name
            pos_profile.cost_center = cost_center[0].name

        round_off_account = frappe.get_all('Account', filters={'company': data.company_name, 'account_type': 'Round Off', 'is_group': 0}, skip_permissions=True, limit=1)
        if round_off_account:
            pos_profile.write_off_account = round_off_account[0].name

        pos_profile.update_stock = 0
        pos_profile.validate_stock_on_save = 0
        pos_profile.insert(ignore_permissions=True)

    frappe.db.set_single_value('System Settings', 'setup_complete', 1)

    if data.email:
        login_manager = LoginManager()
        login_manager.run_post_login_hooks = True
        login_manager.login_as(data.email)
        frappe.local.login_manager = login_manager

    return {
        'status': 'success',
        'home_url': '/ury',
        'message': 'System setup completed successfully.'
    }


@frappe.whitelist(allow_guest=True, methods=['POST', 'GET'])
def submit_setup(payload=None, **kwargs):
    if payload is None:
        payload = kwargs.copy()
    elif isinstance(payload, str):
        payload = json.loads(payload)
    return setup_organization(**payload)


@frappe.whitelist(allow_guest=True, methods=['POST', 'GET'])
def complete_wizard_setup(payload=None, **kwargs):
    if payload is None:
        payload = kwargs.copy()
    elif isinstance(payload, str):
        payload = json.loads(payload)
    return setup_organization(**payload)


@frappe.whitelist()
def get_business_setup():
    company = frappe.get_all('Company', limit=1)
    if not company:
        frappe.throw(_('No Company found.'))
    company_name = company[0].name

    branches = frappe.get_all('Branch', fields=['*'])
    restaurant = frappe.get_doc('URY Restaurant', company_name) if frappe.db.exists('URY Restaurant', company_name) else None

    return {
        'status': 'success',
        'data': {
            'branches': branches,
            'restaurant': restaurant.as_dict() if restaurant else None,
            'company': company_name
        }
    }


@frappe.whitelist()
def update_business_setup(branch=None, restaurant=None):
    if branch:
        if isinstance(branch, str):
            branch = frappe.parse_json(branch)

        branches_data = branch if isinstance(branch, list) else [branch]

        for b_data in branches_data:
            branch_name = b_data.get('name') or b_data.get('branch')
            if branch_name and frappe.db.exists('Branch', branch_name):
                doc = frappe.get_doc('Branch', branch_name)
                doc.update(b_data)
                doc.save(ignore_permissions=True)
            elif branch_name:
                doc = frappe.new_doc('Branch')
                doc.branch = branch_name
                doc.update(b_data)
                doc.insert(ignore_permissions=True)

    if restaurant:
        if isinstance(restaurant, str):
            restaurant = frappe.parse_json(restaurant)

        restaurants_data = restaurant if isinstance(restaurant, list) else [restaurant]

        company = frappe.get_all('Company', limit=1)
        company_name = company[0].name if company else None

        for r_data in restaurants_data:
            restaurant_name = r_data.get('name') or r_data.get('restaurant_name') or company_name
            if restaurant_name and frappe.db.exists('URY Restaurant', restaurant_name):
                rdoc = frappe.get_doc('URY Restaurant', restaurant_name)
                rdoc.update(r_data)
                rdoc.save(ignore_permissions=True)
            elif restaurant_name:
                rdoc = frappe.new_doc('URY Restaurant')
                rdoc.name = restaurant_name
                if not r_data.get('company'):
                    rdoc.company = company_name
                rdoc.update(r_data)
                rdoc.insert(ignore_permissions=True)

    return {'status': 'success'}
