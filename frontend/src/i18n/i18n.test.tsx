import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { startDomI18n } from '@ury/core';
import russian from './ru.json';
import englishPos from '../pages/Pos/i18n/locales/en.json';
import russianPos from '../pages/Pos/i18n/locales/ru.json';
import { initI18n, t, getActiveLanguage } from '../pages/Pos/i18n';
import { resolveLanguage } from '../pages/Pos/i18n/resolve-language';
import { getLocale } from '../pages/Pos/i18n/loader';
import { getManagementLocale, resolveManagementLanguage } from './language';
import { LanguageSwitcher } from './LanguageSwitcher';
import { translate } from './translate';

let stopTranslation: (() => void) | undefined;
const appWindow = window as Window & { frappe?: { boot?: { lang?: string } } };

beforeEach(() => {
  localStorage.clear();
  delete appWindow.frappe;
});

afterEach(() => {
  stopTranslation?.();
  stopTranslation = undefined;
  cleanup();
  delete appWindow.frappe;
});

describe('management and embedded POS language', () => {
  it('uses the saved choice ahead of the Frappe language in both apps', () => {
    appWindow.frappe = { boot: { lang: 'en' } };
    localStorage.setItem('ury_language', 'ru');
    expect(resolveManagementLanguage()).toBe('ru');
    expect(resolveLanguage()).toBe('ru');
    expect(getManagementLocale()).toBe('ru-RU');
    localStorage.setItem('ury_language', 'en');
    appWindow.frappe.boot!.lang = 'ru';
    expect(resolveManagementLanguage()).toBe('en');
    expect(resolveLanguage()).toBe('en');
  });

  it('normalizes Russian Frappe locales and falls back to English', () => {
    appWindow.frappe = { boot: { lang: 'ru-RU' } };
    expect(resolveManagementLanguage()).toBe('ru');
    appWindow.frappe.boot!.lang = 'fr';
    expect(resolveManagementLanguage()).toBe('en');
    expect(getManagementLocale('en-IN')).toBe('en-IN');
  });

  it('offers English and Russian with the selected language announced', () => {
    localStorage.setItem('ury_language', 'ru');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('group', { name: 'Выбор языка' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RU' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('loads Russian before an asynchronous layout effect and interpolates values', async () => {
    const initializing = initI18n('ru');
    expect(t('payment.pay_button', { amount: '2 500 ₸' })).toContain('2 500 ₸');
    expect(t('common.cancel')).toBe('Отмена');
    expect(getActiveLanguage()).toBe('ru');
    await initializing;
    expect(t('unknown.key')).toBe('unknown.key');
  });

  it('falls back to the English text for a missing Russian key', async () => {
    const locale = getLocale('ru');
    const common = locale.common;
    if (!common || typeof common !== 'object') throw new Error('Missing common dictionary');
    const entries = common as Record<string, unknown>;
    const saved = entries.cancel;
    try {
      delete entries.cancel;
      await initI18n('ru');
      expect(t('common.cancel')).toBe('Cancel');
    } finally {
      entries.cancel = saved;
    }
    await initI18n('unknown');
    expect(getActiveLanguage()).toBe('en');
    expect(t('common.cancel')).toBe('Cancel');
  });
});

describe('Russian catalog', () => {
  it('covers every embedded POS key and preserves interpolation parameters', () => {
    const check = (en: Record<string, unknown>, ru: Record<string, unknown>, prefix = '') => {
      for (const [key, value] of Object.entries(en)) {
        if (typeof value === 'string') {
          expect(ru[key], prefix + key).toBeTypeOf('string');
          expect(String(ru[key]).match(/\{\{\w+\}\}/g)?.sort() ?? [], prefix + key)
            .toEqual(value.match(/\{\{\w+\}\}/g)?.sort() ?? []);
        } else {
          check(value as Record<string, unknown>, ru[key] as Record<string, unknown>, prefix + key + '.');
        }
      }
    };
    check(englishPos, russianPos);
  });

  it('translates native-dialog copy and preserves unknown user content', () => {
    localStorage.setItem('ury_language', 'ru');
    expect(translate('Are you sure you want to delete this profile?')).toBe('Удалить этот профиль?');
    expect(translate('API key saved for {{value0}}', { value0: 'My provider' }))
      .toBe('Ключ API сохранён для My provider');
    expect(translate('Customer supplied name')).toBe('Customer supplied name');
    localStorage.setItem('ury_language', 'en');
    expect(translate('Sales Plan')).toBe('Sales Plan');
  });

  it('translates singular and plural upload messages with filenames intact', async () => {
    localStorage.setItem('ury_language', 'ru');
    stopTranslation = startDomI18n(russian);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    render(<div>
      <p>Imported 1 item from menu.csv, review and edit below.</p>
      <p>Imported 12 items from menu.csv, review and edit below.</p>
    </div>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Импортировано позиций: 1. Источник: menu.csv. Проверьте и отредактируйте их ниже.')).toBeInTheDocument();
    expect(screen.getByText('Импортировано позиций: 12. Источник: menu.csv. Проверьте и отредактируйте их ниже.')).toBeInTheDocument();
  });

  it('translates newly rendered UI, attributes and dynamic messages without changing form values', async () => {
    localStorage.setItem('ury_language', 'ru');
    stopTranslation = startDomI18n(russian);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const { rerender } = render(
      <div>
        <h1>Sales Plan</h1>
        <input aria-label="Requested quantity" placeholder="Search menu items..." defaultValue="My item" />
        <select aria-label="Policy" defaultValue="Plan Controlled">
          <option value="Plan Controlled">Plan Controlled</option>
        </select>
        <p>Send Order (3 items)</p>
      </div>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('heading')).toHaveTextContent('План продаж');
    expect(screen.getByPlaceholderText('Поиск позиций меню…')).toHaveValue('My item');
    expect(screen.getByRole('combobox')).toHaveValue('Plan Controlled');
    expect(screen.getByRole('option')).toHaveTextContent('По плану');
    expect(screen.getByText('Отправить заказ (позиций: 3)')).toBeInTheDocument();
    rerender(<div><p>Send Order (5 items)</p></div>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Отправить заказ (позиций: 5)')).toBeInTheDocument();
  });
});
