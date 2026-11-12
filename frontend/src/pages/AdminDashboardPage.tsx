import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import type { ViewKey } from '@/components/Sidebar';
import { ComandasBoard } from '@/components/ComandasBoard';
import { HistorialView } from '@/components/HistorialView';
import { StatsSection } from '@/components/StatsSection';
import { TomarPedidoView } from '@/components/TomarPedidoView';
import { ControlCajaView } from '@/components/ControlCajaView';
import { ClientesView } from '@/components/ClientesView';
import { RepartidoresView } from '@/components/RepartidoresView';
import { CatalogoView } from '@/components/CatalogoView';
import { PromocionesView } from '@/components/PromocionesView';
import { IngredientesView } from '@/components/IngredientesView';
import { MenuImagenView } from '@/components/MenuImagenView';
import { ReporteIngredientesView } from '@/components/ReporteIngredientesView';
import { HorariosView } from '@/components/HorariosView';
import { ConfiguracionWebView } from '@/components/ConfiguracionWebView';
import { ImpresorasView } from '@/components/ImpresorasView';
import { HandoffNotifications } from '@/components/HandoffNotifications';
import { PinModal } from '@/components/PinModal';
import { PinSecurityProvider } from '@/context/PinSecurityContext';
import { usePinSecurity } from '@/hooks/usePinSecurity';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { applyThemeColor } from '@/utils/theme';
import type { PinType } from '@/types/security';
import { panelBackground } from '@/utils/panelBackground';
import { canKeepMenuOpen } from '@/utils/sidebarDock';

// Ver la regla en index.css: corre las secciones solo lo necesario para no quedar bajo la columna de chats.
const CHAT_COLUMN_PADDING = 'chat-column-offset';

export default function AdminDashboardPage() {
  return (
    <PinSecurityProvider>
      <AdminDashboardContent />
    </PinSecurityProvider>
  );
}

/** Secciones que piden el PIN de administración para abrirse. */
const ADMIN_PIN_VIEWS: ViewKey[] = ['estadisticas', 'reporte-ingredientes'];

function AdminDashboardContent() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { isAdminUnlocked, unlockAdmin, isCashUnlocked, unlockCash } = usePinSecurity();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>('comandas');
  // Con la columna de chats a la derecha, las secciones se corren solo si no entran a su izquierda.
  const [chatColumnVisible, setChatColumnVisible] = useState(false);
  const { storeConfig, setStoreConfig } = useStoreConfig();

  const [pendingProtectedView, setPendingProtectedView] = useState<ViewKey | null>(null);

  const cashPinEnabled = Boolean(storeConfig?.cash_pin_enabled);
  const isProtectedByAdminPin = (view: ViewKey | null) => view !== null && ADMIN_PIN_VIEWS.includes(view);
  const needsAdminPin =
    !isAdminUnlocked && (isProtectedByAdminPin(activeView) || isProtectedByAdminPin(pendingProtectedView));
  const needsCashPin =
    !isCashUnlocked && cashPinEnabled && (activeView === 'caja' || pendingProtectedView === 'caja');

  const pinModalOpen = needsAdminPin || needsCashPin;
  const pinModalType: PinType = needsAdminPin ? 'admin' : 'cash';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Estadísticas y el reporte de ingredientes piden el PIN de administración; el control de caja, el PIN de caja
  // si está habilitado. Hasta que se ingresa, la sección queda pendiente.
  const needsPinToOpen = (view: ViewKey) =>
    (isProtectedByAdminPin(view) && !isAdminUnlocked) || (view === 'caja' && cashPinEnabled && !isCashUnlocked);

  const handleSelectView = (view: ViewKey) => {
    if (needsPinToOpen(view)) setPendingProtectedView(view);
    else setActiveView(view);
    if (!canKeepMenuOpen()) setMenuOpen(false);
  };

  const handlePinSuccess = (token: string) => {
    if (pinModalType === 'admin') {
      unlockAdmin(token);
    } else {
      unlockCash(token);
    }
    if (pendingProtectedView) {
      setActiveView(pendingProtectedView);
      setPendingProtectedView(null);
    }
  };

  const handlePinCancel = () => {
    setPendingProtectedView(null);
    // Si la vista activa requiere protección y no está desbloqueada, volver a comandas
    if (
      (!isAdminUnlocked && (activeView === 'estadisticas' || activeView === 'reporte-ingredientes')) ||
      (!isCashUnlocked && activeView === 'caja' && storeConfig?.cash_pin_enabled)
    ) {
      setActiveView('comandas');
    }
  };

  const background = panelBackground(storeConfig);

  return (
    <div className="relative isolate min-h-screen lg:h-screen lg:overflow-hidden bg-gray-50 flex flex-col">
      {background && (
        // Capa fija detrás de todo; las fotos se agrandan un poco para que el desenfoque no deje bordes claros.
        <div
          data-testid="admin-panel-bg"
          aria-hidden="true"
          className={`fixed inset-0 -z-10 bg-cover bg-center ${background.blurred ? 'scale-110 blur-md' : ''}`}
          style={{ backgroundImage: background.css }}
        />
      )}
      <TopBar
        onToggleMenu={() => setMenuOpen((prev) => !prev)}
        menuOpen={menuOpen}
        onLogout={handleLogout}
        title={storeConfig?.store_name}
        logoUrl={storeConfig?.logo_url}
        themeColor={storeConfig?.theme_color}
      />
      <main
        className={`flex-1 px-4 py-6 lg:min-h-0 lg:overflow-y-auto transition-[padding] ${
          chatColumnVisible ? CHAT_COLUMN_PADDING : ''
        } ${pinModalOpen ? 'filter blur-sm pointer-events-none select-none' : ''}`}
      >
        <div className="max-w-6xl mx-auto lg:h-full">
          <div hidden={activeView !== 'tomar-pedido'} className="lg:h-full">
            <TomarPedidoView />
          </div>
          {activeView === 'caja' && <ControlCajaView />}
          <div hidden={activeView !== 'comandas'} className="lg:h-full">
            <ComandasBoard
              onTakeOrder={() => setActiveView('tomar-pedido')}
              themeColor={storeConfig?.theme_color}
            />
          </div>
          {activeView === 'historial' && <HistorialView />}
          {activeView === 'estadisticas' && <StatsSection />}
          {activeView === 'reporte-ingredientes' && <ReporteIngredientesView />}
          {activeView === 'clientes' && <ClientesView />}
          {activeView === 'repartidores' && <RepartidoresView themeColor={storeConfig?.theme_color} />}
          {activeView === 'productos' && <CatalogoView />}
          {activeView === 'promociones' && (
            <div className="flex flex-col gap-4 lg:h-full">
              <div className="shrink-0 bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <h1 className="text-lg font-bold text-gray-900">Promociones</h1>
                  <p className="text-xs text-gray-500">
                    Organizá los combos y promociones del local. Lo que cambies acá se ve al instante en el menú web y en el chatbot.
                  </p>
                </div>
              </div>
              <PromocionesView />
            </div>
          )}
          {activeView === 'ingredientes' && <IngredientesView />}
          {activeView === 'menu-imagen' && <MenuImagenView />}
          {activeView === 'horarios' && <HorariosView />}
          {activeView === 'impresoras' && (
            <div className="lg:h-full lg:overflow-y-auto pr-1">
              <ImpresorasView />
            </div>
          )}
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

      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeView={activeView}
        onSelect={handleSelectView}
        themeColor={storeConfig?.theme_color}
      />

      <HandoffNotifications onVisibleChange={setChatColumnVisible} />

      <PinModal
        isOpen={pinModalOpen}
        pinType={pinModalType}
        onSuccess={handlePinSuccess}
        onCancel={handlePinCancel}
      />
    </div>
  );
}
