import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage, validateCustomerData } from '@/utils/customerValidation';
import type { CustomerDataErrors } from '@/utils/customerValidation';

export type CustomerAuthMode = 'login' | 'register';

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black';

interface RegisterErrors extends CustomerDataErrors {
  email?: string;
  password?: string;
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function CustomerAuthModal({
  initialMode,
  onClose,
}: {
  initialMode: CustomerAuthMode;
  onClose: () => void;
}) {
  const { login, register, logout } = useAuth();
  const [mode, setMode] = useState<CustomerAuthMode>(initialMode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [errors, setErrors] = useState<RegisterErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const switchMode = (next: CustomerAuthMode) => {
    setMode(next);
    setErrors({});
    setSubmitError(null);
  };

  const validate = (): RegisterErrors => {
    const nextErrors: RegisterErrors = {};
    if (!email.trim()) nextErrors.email = 'Ingresá tu email.';
    if (!password) nextErrors.password = 'Ingresá tu contraseña.';
    if (mode === 'register') {
      if (password && password.length < 8) nextErrors.password = 'La contraseña debe tener al menos 8 caracteres.';
      Object.assign(nextErrors, validateCustomerData({ full_name: fullName, phone, address }));
    }
    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const me = await login(email.trim(), password);
        if (me.role !== 'CUSTOMER') {
          logout();
          setSubmitError('Esta cuenta es de administración. Ingresá con una cuenta de cliente.');
          return;
        }
      } else {
        await register({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim(),
          address: address.trim(),
        });
      }
      onClose();
    } catch (err) {
      setSubmitError(
        getErrorMessage(err, mode === 'login' ? 'No se pudo iniciar sesión.' : 'No se pudo crear la cuenta.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-auth-title"
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 w-8 h-8 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition"
        >
          ×
        </button>

        <h2 id="customer-auth-title" className="text-xl font-bold text-gray-900 mb-1">
          {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {mode === 'login'
            ? 'Ingresá para que completemos tus datos automáticamente.'
            : 'Guardamos tus datos para autocompletarlos en tus próximos pedidos.'}
        </p>

        <div className="flex rounded-xl border border-gray-300 overflow-hidden text-sm mb-5">
          {(['login', 'register'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => switchMode(option)}
              className={`flex-1 py-2 font-medium transition ${
                mode === option ? 'bg-black text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {option === 'login' ? 'Ingresar' : 'Registrarme'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {mode === 'register' && (
            <Field id="auth-name" label="Nombre" error={errors.full_name}>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          )}

          <Field id="auth-email" label="Email" error={errors.email}>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Field id="auth-password" label="Contraseña" error={errors.password}>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          {mode === 'register' && (
            <>
              <Field id="auth-phone" label="Teléfono" error={errors.phone}>
                <input
                  id="auth-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field id="auth-address" label="Dirección" error={errors.address}>
                <input
                  id="auth-address"
                  type="text"
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
            </>
          )}

          {submitError && (
            <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-black text-white rounded-xl py-2.5 font-semibold hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting
              ? mode === 'login'
                ? 'Ingresando...'
                : 'Creando cuenta...'
              : mode === 'login'
                ? 'Ingresar'
                : 'Crear cuenta'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-gray-900 transition"
          >
            Seguir como invitado
          </button>
        </form>
      </div>
    </div>
  );
}
