import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from './ui/button';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language;
  const isArabic = currentLanguage === 'ar';

  // Update document direction and lang attribute when language changes
  useEffect(() => {
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage, isArabic]);

  const toggleLanguage = () => {
    const newLang = isArabic ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
  };

  return (
    <Button
      onClick={toggleLanguage}
      variant="ghost"
      className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
      title={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      <Languages className="w-5 h-5" />
      <span className="text-sm font-medium">{isArabic ? 'EN' : 'عربي'}</span>
    </Button>
  );
};

export default LanguageSwitcher;
