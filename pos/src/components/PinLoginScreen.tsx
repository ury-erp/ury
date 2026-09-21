import { useCallback, useEffect, useState } from 'react';
import { Check, Delete, KeyRound, LogIn } from 'lucide-react';
import { Button } from '@ury/ui';
import { loginWithPin } from '../lib/pin-auth-api';
import { t } from '../i18n';

interface PinLoginScreenProps {
  minLength: number;
  maxLength: number;
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as Record<string, unknown>;
  const response =
    value.response && typeof value.response === 'object'
      ? (value.response as Record<string, unknown>)
      : {};
  const status = value.httpStatus ?? value.status ?? value.statusCode ?? response.status;
  const message = String(
    value.message ?? value.exception ?? response.statusText ?? response.data ?? ''
  );
  return status === 429 || /rate limit|too many requests/i.test(message);
}

const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const PinLoginScreen = ({ minLength, maxLength }: PinLoginScreenProps) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addDigit = useCallback(
    (digit: string) => {
      if (isSubmitting) return;
      setError('');
      setPin((current) => (current.length < maxLength ? `${current}${digit}` : current));
    },
    [isSubmitting, maxLength]
  );

  const removeDigit = useCallback(() => {
    if (isSubmitting) return;
    setError('');
    setPin((current) => current.slice(0, -1));
  }, [isSubmitting]);

  const submit = useCallback(async () => {
    if (isSubmitting || pin.length < minLength || pin.length > maxLength) return;

    setIsSubmitting(true);
    setError('');
    try {
      await loginWithPin(pin);
      // Reloading is intentional: the page boot payload was generated for Guest.
      // A fresh request hydrates roles, language, CSRF and POS Profile for the
      // newly authenticated Frappe user.
      window.location.replace('/pos');
    } catch (loginError) {
      setPin('');
      setError(
        isRateLimitError(loginError)
          ? t('pin_login.too_many_attempts')
          : t('pin_login.invalid_pin')
      );
      setIsSubmitting(false);
    }
  }, [isSubmitting, maxLength, minLength, pin]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        addDigit(event.key);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        removeDigit();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addDigit, removeDigit, submit]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50 flex items-center justify-center p-3 [@media(min-height:800px)]:p-8">
      <section className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60 [@media(min-height:800px)]:p-8">
        <div className="flex flex-col items-center text-center">
          <img
            src="/assets/ury/pos/ury_pos.png"
            alt="URY POS"
            className="h-10 w-auto [@media(min-height:800px)]:h-14"
          />
          <div className="mt-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 [@media(min-height:800px)]:mt-6 [@media(min-height:800px)]:h-14 [@media(min-height:800px)]:w-14">
            <KeyRound className="h-6 w-6 [@media(min-height:800px)]:h-7 [@media(min-height:800px)]:w-7" />
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-gray-950 [@media(min-height:800px)]:mt-4 [@media(min-height:800px)]:text-2xl">
            {t('pin_login.title')}
          </h1>
          <p className="mt-1 max-w-xs text-sm leading-5 text-gray-500 [@media(min-height:800px)]:mt-2 [@media(min-height:800px)]:leading-6">
            {t('pin_login.subtitle')}
          </p>
        </div>

        <div
          className="mt-3 flex min-h-8 items-center justify-center gap-3 [@media(min-height:800px)]:mt-6 [@media(min-height:800px)]:min-h-12"
          aria-label={t('pin_login.pin_progress', { count: pin.length })}
          aria-live="polite"
        >
          {Array.from({ length: maxLength }).map((_, index) => (
            <span
              key={index}
              className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
                index < pin.length
                  ? 'border-primary-600 bg-primary-600'
                  : 'border-gray-300 bg-white'
              }`}
            />
          ))}
        </div>

        <div className="min-h-6 text-center" aria-live="assertive">
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>

        <div className="mt-1 grid grid-cols-3 gap-2 [@media(min-height:800px)]:mt-2 [@media(min-height:800px)]:gap-3">
          {keypad.map((digit) => (
            <Button
              key={digit}
              type="button"
              variant="outline"
              className="h-12 rounded-2xl bg-white text-xl font-semibold text-gray-900 shadow-sm hover:bg-gray-50 [@media(min-height:800px)]:h-16 [@media(min-height:800px)]:text-2xl"
              onClick={() => addDigit(digit)}
              disabled={isSubmitting}
              aria-label={digit}
            >
              {digit}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl bg-gray-50 text-gray-700 [@media(min-height:800px)]:h-16"
            onClick={removeDigit}
            disabled={isSubmitting || pin.length === 0}
            aria-label={t('pin_login.delete_digit')}
          >
            <Delete className="h-6 w-6" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl bg-white text-xl font-semibold text-gray-900 shadow-sm hover:bg-gray-50 [@media(min-height:800px)]:h-16 [@media(min-height:800px)]:text-2xl"
            onClick={() => addDigit('0')}
            disabled={isSubmitting}
            aria-label="0"
          >
            0
          </Button>
          <Button
            type="button"
            className="h-12 rounded-2xl [@media(min-height:800px)]:h-16"
            onClick={submit}
            disabled={isSubmitting || pin.length < minLength}
            aria-label={t('pin_login.sign_in')}
          >
            {isSubmitting ? (
              <LogIn className="h-6 w-6 animate-pulse" />
            ) : (
              <Check className="h-7 w-7" />
            )}
          </Button>
        </div>

        <div className="mt-3 border-t border-gray-100 pt-3 text-center [@media(min-height:800px)]:mt-6 [@media(min-height:800px)]:pt-5">
          <a
            href="/login?redirect-to=%2Fpos"
            className="inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-primary-700 hover:bg-primary-50 [@media(min-height:800px)]:min-h-11"
          >
            {t('pin_login.use_password')}
          </a>
          <p className="mt-1 text-xs leading-4 text-gray-400 [@media(min-height:800px)]:mt-2 [@media(min-height:800px)]:leading-5">
            {t('pin_login.manager_hint')}
          </p>
        </div>
      </section>
    </main>
  );
};

export default PinLoginScreen;
