import { useCallback, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { Button } from '@ury/ui';
import { enrollTerminal } from '../lib/pin-auth-api';
import { t } from '../i18n';

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

const TerminalEnrollmentScreen = () => {
  const [terminalId, setTerminalId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmedId = terminalId.trim();
      const trimmedCode = code.trim();
      if (isSubmitting || !trimmedId || !trimmedCode) return;

      setIsSubmitting(true);
      setError('');
      try {
        await enrollTerminal(trimmedId, trimmedCode);
        // The device credential is now set as an httpOnly cookie. A fresh load
        // re-runs the guest status check and offers the PIN keypad.
        window.location.replace('/pos');
      } catch (enrollError) {
        setError(
          isRateLimitError(enrollError)
            ? t('terminal_enroll.too_many_attempts')
            : t('terminal_enroll.failed')
        );
        setIsSubmitting(false);
      }
    },
    [code, isSubmitting, terminalId]
  );

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
            <MonitorSmartphone className="h-6 w-6 [@media(min-height:800px)]:h-7 [@media(min-height:800px)]:w-7" />
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-gray-950 [@media(min-height:800px)]:mt-4 [@media(min-height:800px)]:text-2xl">
            {t('terminal_enroll.title')}
          </h1>
          <p className="mt-1 max-w-xs text-sm leading-5 text-gray-500 [@media(min-height:800px)]:mt-2 [@media(min-height:800px)]:leading-6">
            {t('terminal_enroll.subtitle')}
          </p>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <div>
            <label
              htmlFor="terminal-id"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t('terminal_enroll.terminal_id')}
            </label>
            <input
              id="terminal-id"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={terminalId}
              onChange={(event) => {
                setError('');
                setTerminalId(event.target.value);
              }}
              disabled={isSubmitting}
              className="h-11 w-full rounded-xl border border-gray-300 px-3 text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div>
            <label
              htmlFor="enrollment-code"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t('terminal_enroll.code')}
            </label>
            <input
              id="enrollment-code"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={code}
              onChange={(event) => {
                setError('');
                setCode(event.target.value);
              }}
              disabled={isSubmitting}
              className="h-11 w-full rounded-xl border border-gray-300 px-3 font-mono tracking-wide text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-red-600" role="alert" aria-live="polite">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-2xl"
            disabled={isSubmitting || !terminalId.trim() || !code.trim()}
          >
            {isSubmitting ? t('terminal_enroll.enrolling') : t('terminal_enroll.enroll')}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs leading-4 text-gray-400 [@media(min-height:800px)]:mt-6 [@media(min-height:800px)]:leading-5">
          {t('terminal_enroll.manager_hint')}
        </p>
      </section>
    </main>
  );
};

export default TerminalEnrollmentScreen;
