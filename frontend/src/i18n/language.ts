import { resolveUryLanguage, setUryLanguage } from '@ury/core';

export type ManagementLanguage = 'en' | 'ru';

export const MANAGEMENT_LANGUAGES: Record<ManagementLanguage, string> = {
  en: 'English',
  ru: 'Русский',
};

export function resolveManagementLanguage(): ManagementLanguage {
  return resolveUryLanguage() === 'ru' ? 'ru' : 'en';
}

export function setManagementLanguage(language: ManagementLanguage): void {
  setUryLanguage(language);
}

export function getManagementLocale(englishLocale = 'en-US'): string {
  return resolveManagementLanguage() === 'ru' ? 'ru-RU' : englishLocale;
}
