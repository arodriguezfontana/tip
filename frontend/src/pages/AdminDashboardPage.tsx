import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import type { ViewKey } from '@/components/Sidebar';
import { ComandasBoard } from '@/components/ComandasBoard';
import { HistorialView } from '@/components/HistorialView';
import { IngresosView } from '@/components/IngresosView';
import { StatsSection } from '@/components/StatsSection';

export default function AdminDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>('comandas');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar onToggleMenu={() => setMenuOpen((prev) => !prev)} menuOpen={menuOpen} onLogout={handleLogout} />
      <main className="flex-1 px-4 py-10">
        <div className="max-w-6xl mx-auto space-y-6">
          {activeView === 'comandas' && <ComandasBoard active={activeView === 'comandas'} />}
          {activeView === 'historial' && <HistorialView />}
          {activeView === 'ingresos' && <IngresosView />}
          {activeView === 'estadisticas' && <StatsSection />}
        </div>
      </main>

      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeView={activeView}
        onSelect={(view) => setActiveView(view)}
      />
    </div>
  );
}
