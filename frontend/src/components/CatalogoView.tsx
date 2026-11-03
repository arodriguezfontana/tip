import { useState } from 'react';
import { CategoriasView } from '@/components/CategoriasView';
import { ProductosView } from '@/components/ProductosView';
import { PromocionesView } from '@/components/PromocionesView';

type CatalogTab = 'productos' | 'categorias' | 'promociones';

const TABS: { key: CatalogTab; label: string }[] = [
  { key: 'productos', label: 'Productos' },
  { key: 'categorias', label: 'Categorías' },
  { key: 'promociones', label: 'Promociones' },
];

/** Sección del panel para gestionar el catálogo: productos (con su receta e imagen), categorías del menú y promociones. */
export function CatalogoView() {
  const [tab, setTab] = useState<CatalogTab>('productos');

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <div className="shrink-0 bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Productos y categorías</h1>
          <p className="text-xs text-gray-500">
            Organizá la oferta del local: productos, categorías y promociones. Lo que cambies acá se ve al instante en el menú web y en el chatbot.
          </p>
        </div>
        <div role="tablist" aria-label="Catálogo" className="inline-flex self-start sm:self-auto rounded-xl bg-gray-100 p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`catalog-tab-${item.key}`}
              aria-selected={tab === item.key}
              aria-controls={`catalog-panel-${item.key}`}
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                tab === item.key ? 'bg-black text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cada pestaña vuelve a cargar sus datos al abrirse: así refleja lo que se cambió en la otra. */}
      <div
        role="tabpanel"
        id={`catalog-panel-${tab}`}
        aria-labelledby={`catalog-tab-${tab}`}
        className="flex flex-col lg:flex-1 lg:min-h-0"
      >
        {tab === 'productos' ? (
          <ProductosView />
        ) : tab === 'categorias' ? (
          <CategoriasView />
        ) : (
          <PromocionesView />
        )}
      </div>
    </div>
  );
}
