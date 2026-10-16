import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import type { ViewKey } from '@/components/Sidebar';
import { ComandasBoard } from '@/components/ComandasBoard';
import { HistorialView } from '@/components/HistorialView';
import { StatsSection } from '@/components/StatsSection';
import { TomarPedidoView } from '@/components/TomarPedidoView';
import { ClientesView } from '@/components/ClientesView';
import { ConfiguracionWebView } from '@/components/ConfiguracionWebView';
import { fetchStoreConfig } from '@/services/storeConfigService';
import { applyThemeColor } from '@/utils/theme';
import type { StoreConfig } from '@/types/storeConfig';

export default function AdminDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>('comandas');
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStoreConfig()
      .then((data) => {
        if (!cancelled) {
          setStoreConfig(data);
          if (data?.theme_color) {
            applyThemeColor(data.theme_color);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-gray-50 flex flex-col">
      <TopBar
        onToggleMenu={() => setMenuOpen((prev) => !prev)}
        menuOpen={menuOpen}
        onLogout={handleLogout}
        title={storeConfig?.store_name}
        logoUrl={storeConfig?.logo_url}
        themeColor={storeConfig?.theme_color}
      />
      <main className="flex-1 px-4 py-6 lg:min-h-0 overflow-y-auto">
        <div
          className={`${activeView === 'tomar-pedido' ? 'max-w-7xl' : 'max-w-6xl'} mx-auto ${
            activeView === 'tomar-pedido' || activeView === 'comandas' ? 'lg:h-full' : 'pb-12'
          }`}
        >
          <div hidden={activeView !== 'tomar-pedido'} className="lg:h-full">
            <TomarPedidoView />
          </div>
          <div hidden={activeView !== 'comandas'} className="lg:h-full">
            <ComandasBoard
              onTakeOrder={() => setActiveView('tomar-pedido')}
              themeColor={storeConfig?.theme_color}
            />
          </div>
          {activeView === 'historial' && <HistorialView themeColor={storeConfig?.theme_color} />}
          {activeView === 'estadisticas' && <StatsSection />}
          {activeView === 'clientes' && <ClientesView />}
          {activeView === 'configuracion-web' && (
            <ConfiguracionWebView
              onConfigUpdated={(updated) => {
                setStoreConfig(updated);
                if (updated?.theme_color) {
                  applyThemeColor(updated.theme_color);
                }
              }}
            />
          )}
        </div>
      </main>

      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeView={activeView}
        themeColor={storeConfig?.theme_color}
        onSelect={(view) => {
          setActiveView(view);
          setMenuOpen(false);
        }}
      />
    </div>
  );
}