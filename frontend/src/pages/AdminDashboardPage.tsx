import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/TopBar';

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar />
      <main className="flex-1 px-4 py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl shadow-md p-8 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Panel de administración</h2>
              <p className="text-sm text-gray-500 mt-1">
                Sesión iniciada como <span className="font-medium text-gray-700">{user?.email}</span>{' '}
                ({user?.role})
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="bg-black text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-gray-800 transition"
            >
              Cerrar sesión
            </button>
          </div>

          <div className="rounded-xl bg-blue-50 text-blue-900 px-4 py-3 text-sm">
            El panel de gestión del negocio está en construcción. Este acceso confirma que la
            autenticación funciona correctamente.
          </div>
        </div>
      </main>
    </div>
  );
}
