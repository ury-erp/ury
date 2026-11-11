import { __ } from '../i18n';

/** Plain "you do not have access" page. Used while `/ury/pos/*` is blocked (see lib/posRouteBlock.ts). */
export function NoAccess() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">{__('Access Denied')}</h2>
        <p className="text-muted-foreground">{__('You do not have access to this page.')}</p>
      </div>
    </div>
  );
}
