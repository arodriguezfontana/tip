import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/TopBar';
import type { ApiErrorResponse } from '@/services/api';
import backgroundLogin from '@/assets/background_login.webp';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/admin';
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      const apiError = err as ApiErrorResponse;
      setError(apiError.message ?? 'No se pudo iniciar sesión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-gray-900 bg-cover bg-center"
      style={{ backgroundImage: `url(${backgroundLogin})` }}
    >
      <div className="min-h-screen flex flex-col bg-black/60">
        <TopBar />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Iniciar sesión</h2>
            <p className="text-sm text-gray-500 mb-6">Acceso exclusivo para administradores</p>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-black text-white rounded-xl py-2.5 font-semibold hover:bg-gray-800 disabled:opacity-50 transition"
              >
                {isSubmitting ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
