import { Card, CardContent } from '@ury/ui';
import { t } from '../i18n';
import POSCloseFlow from '../components/POSCloseFlow';

export default function Settings() {
  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">{t('settings.title')}</h1>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {t('settings.end_of_day')}
          </h2>
          <POSCloseFlow />
        </div>

        <Card className="bg-white border border-gray-200">
          <CardContent className="p-8 text-center">
            <p className="text-gray-600 text-sm">{t('settings.coming_soon')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
