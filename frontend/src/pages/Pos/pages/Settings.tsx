import { Card, CardContent } from '@ury/ui';
import { t } from '../i18n';
import POSCloseFlow from '../components/POSCloseFlow';

export default function Settings() {
  return (
    <div className="h-full overflow-y-auto p-6 bg-muted">
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-xl font-semibold text-foreground">{t('settings.title')}</h1>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">
            {t('settings.end_of_day')}
          </h2>
          <POSCloseFlow />
        </div>

        <Card className="bg-card border border-border">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground text-sm">{t('settings.coming_soon')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
