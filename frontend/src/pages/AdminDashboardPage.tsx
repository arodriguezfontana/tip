import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/TopBar';
import { OwnerOrdersDrawer } from '@/components/OwnerOrdersDrawer';
import { StatsSection } from '@/components/StatsSection';

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [ordersPanelOpen, setOrdersPanelOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar
        onToggleOrdersPanel={() => setOrdersPanelOpen((prev) => !prev)}
        ordersPanelOpen={ordersPanelOpen}
      />
      <main className="flex-1 px-4 py-10">
        <div className="max-w-4xl mx-auto space-y-6">
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

          <StatsSection />
        </div>
      </main>

      <OwnerOrdersDrawer open={ordersPanelOpen} onClose={() => setOrdersPanelOpen(false)} />
    </div>
  );
}