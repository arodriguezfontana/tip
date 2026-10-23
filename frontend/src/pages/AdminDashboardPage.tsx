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
import { RepartidoresView } from '@/components/RepartidoresView';
import { CatalogoView } from '@/components/CatalogoView';
import { IngredientesView } from '@/components/IngredientesView';
import { ReporteIngredientesView } from '@/components/ReporteIngredientesView';
import { HorariosView } from '@/components/HorariosView';
import { ConfiguracionWebView } from '@/components/ConfiguracionWebView';
import { HandoffNotifications } from '@/components/HandoffNotifications';
import { fetchStoreConfig } from '@/services/storeConfigService';
import { applyThemeColor } from '@/utils/theme';
import type { StoreConfig } from '@/types/storeConfig';

// Ver la regla en index.css: corre las secciones solo lo necesario para no quedar bajo la columna de chats.
const CHAT_COLUMN_PADDING = 'chat-column-offset';

export default function AdminDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>('comandas');
  // Con la columna de chats a la derecha, las secciones se corren solo si no entran a su izquierda.
  const [chatColumnVisible, setChatColumnVisible] = useState(false);
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStoreConfig()
      .then((config) => {
        if (!cancelled) {
          setStoreConfig(config);
          applyThemeColor(config.theme_color);
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
      <main className={`flex-1 px-4 py-6 lg:min-h-0 transition-[padding] ${chatColumnVisible ? CHAT_COLUMN_PADDING : ''}`}>
        <div className="max-w-6xl mx-auto lg:h-full">
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
          {activeView === 'reporte-ingredientes' && <ReporteIngredientesView />}
          {activeView === 'clientes' && <ClientesView />}
          {activeView === 'repartidores' && <RepartidoresView themeColor={storeConfig?.theme_color} />}
          {activeView === 'productos' && <CatalogoView />}
          {activeView === 'ingredientes' && <IngredientesView />}
          {activeView === 'horarios' && <HorariosView />}
          {activeView === 'configuracion-web' && (
            <div className="lg:h-full lg:overflow-y-auto pr-1">
              <ConfiguracionWebView
                onConfigUpdated={(updated) => {
                  setStoreConfig(updated);
                  applyThemeColor(updated.theme_color);
                }}
              />
            </div>
          )}
        </div>
      </main>

      <HandoffNotifications onVisibleChange={setChatColumnVisible} />

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