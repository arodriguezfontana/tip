interface TopBarProps {
  onToggleOrdersPanel?: () => void;
  ordersPanelOpen?: boolean;
}

export function TopBar({ onToggleOrdersPanel, ordersPanelOpen }: TopBarProps) {
  return (
    <header className="w-full bg-black text-white py-4 relative">
      <h1 className="text-center text-3xl font-bebas uppercase tracking-widest">RestoIT</h1>

      {onToggleOrdersPanel && (
        <button
          type="button"
          onClick={onToggleOrdersPanel}
          aria-expanded={ordersPanelOpen}
          aria-label={ordersPanelOpen ? 'Cerrar panel de pedidos e ingresos' : 'Abrir panel de pedidos e ingresos'}
          className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-white/20 transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </svg>
          Pedidos e ingresos
        </button>
      )}
    </header>
  );
}
