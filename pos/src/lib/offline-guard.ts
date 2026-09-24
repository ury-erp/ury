import { showToast } from '@ury/ui';
import { t } from '../i18n';
import { connectivity } from './connectivity';

/**
 * Refuses an action that must not be attempted while the server is
 * unreachable, and says so.
 *
 * Returns true when it is safe to proceed.
 *
 * The alternative is what the POS did before: fire the request anyway, let
 * it hang until it times out, and leave the cashier staring at a spinner
 * with a guest waiting and no idea whether the payment went through. A
 * refusal that changes nothing is a far better answer than an unresolved
 * request against money.
 *
 * `checking` is allowed through deliberately — an unconfirmed connection is
 * not a known-broken one, and blocking on every in-flight probe would make
 * a slow link unusable.
 */
export function guardOnline(): boolean {
  if (connectivity.getState() !== 'offline') {
    return true;
  }
  showToast.error(t('offline.blocked'));
  return false;
}
