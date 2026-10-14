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
import { TomarPedidoView } from '@/components/TomarPedidoView';
import { ClientesView } from '@/components/ClientesView';
import { HorariosView } from '@/components/HorariosView';

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
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-gray-50 flex flex-col">
      <TopBar onToggleMenu={() => setMenuOpen((prev) => !prev)} menuOpen={menuOpen} onLogout={handleLogout} />
      <main className="flex-1 px-4 py-6 lg:min-h-0">
        <div className={`${activeView === 'tomar-pedido' ? 'max-w-7xl' : 'max-w-6xl'} mx-auto lg:h-full`}>
          <div hidden={activeView !== 'tomar-pedido'} className="lg:h-full">
            <TomarPedidoView />
          </div>
          <div hidden={activeView !== 'comandas'} className="lg:h-full">
            <ComandasBoard onTakeOrder={() => setActiveView('tomar-pedido')} />
          </div>
          {activeView === 'historial' && <HistorialView />}
          {activeView === 'ingresos' && <IngresosView />}
          {activeView === 'estadisticas' && <StatsSection />}
          {activeView === 'clientes' && <ClientesView />}
          {activeView === 'horarios' && <HorariosView />}
        </div>
      </main>

      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeView={activeView}
        onSelect={(view) => {
          setActiveView(view);
          setMenuOpen(false);
        }}
      />
    </div>
  );
}