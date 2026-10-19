import React, { useState, FormEvent } from 'react';
import { AlertTriangle, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button, Input } from '@ury/ui';
import { useRootStore } from '../store/root-store';
import { t } from '../i18n';

const LoginScreen: React.FC = () => {
  const { loginWithCredentials } = useRootStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setErrorMessage(t('login.error_empty'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await loginWithCredentials(trimmedUsername, password);
    } catch (err) {
      const message = (err as Error)?.message || t('login.error_empty');
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {t('login.title')}
            </h1>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-in fade-in duration-200"
            >
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5 text-left">
              <label
                htmlFor="login-username"
                className="block text-sm font-medium text-gray-700"
              >
                {t('login.username')}
              </label>
              <Input
                id="login-username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isSubmitting}
                className="text-base h-11"
                required
              />
            </div>

            <div className="space-y-1.5 text-left">
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-gray-700"
              >
                {t('login.password')}
              </label>
              <div className="relative">
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="text-base h-11 pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-11 h-11 text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password}
              className="w-full h-11 text-base font-semibold mt-2"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('login.logging_in')}
                </span>
              ) : (
                t('login.login')
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
