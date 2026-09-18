import { Button } from '@ury/ui';
import {
  MANAGEMENT_LANGUAGES,
  resolveManagementLanguage,
  setManagementLanguage,
  type ManagementLanguage,
} from './language';

export function LanguageSwitcher() {
  const activeLanguage = resolveManagementLanguage();

  return (
    <div
      role="group"
      aria-label={activeLanguage === 'ru' ? 'Выбор языка' : 'Language selection'}
      className="fixed bottom-3 right-3 z-[100] flex gap-1 rounded-lg border border-border bg-background p-1 shadow-md"
    >
      {(Object.keys(MANAGEMENT_LANGUAGES) as ManagementLanguage[]).map((language) => (
        <Button
          key={language}
          type="button"
          size="sm"
          variant={activeLanguage === language ? 'default' : 'ghost'}
          aria-pressed={activeLanguage === language}
          title={MANAGEMENT_LANGUAGES[language]}
          onClick={() => setManagementLanguage(language)}
        >
          {language.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
