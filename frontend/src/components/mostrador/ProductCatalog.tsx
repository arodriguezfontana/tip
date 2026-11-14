import { useMemo, useState } from 'react';
import { ProductThumbnail } from '@/components/ProductThumbnail';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, Product } from '@/types/order';
import type { Promotion } from '@/types/promotion';
import { productImageSrc } from '@/utils/catalog';
import { formatCurrency } from '@/utils/currency';
import { groupByCategory } from '@/utils/productGrouping';

const ALL_CATEGORIES = 'all';
const PROMOTIONS_CATEGORY = 'promos';
type CategoryFilter = number | typeof ALL_CATEGORIES | typeof PROMOTIONS_CATEGORY;

const PRIMARY_BACKGROUND = { backgroundColor: 'var(--primary-color, #18181b)' };
const QUANTITY_BADGE_CLASS =
  'absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full text-white text-[11px] font-bold flex items-center justify-center';
const TILE_BASE_CLASS =
  'relative flex flex-col items-center text-center gap-1.5 rounded-xl border p-3 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

function QuantityBadge({ quantity }: { quantity: number }) {
  if (quantity === 0) return null;
  return (
    <span style={PRIMARY_BACKGROUND} className={QUANTITY_BADGE_CLASS}>
      {quantity}
    </span>
  );
}

function PromotionTile({ promo, quantity, onAdd }: { promo: Promotion; quantity: number; onAdd: () => void }) {
  const isSelected = quantity > 0;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={quantity >= MAX_QUANTITY_PER_ITEM}
      title={`Agregar promoción ${promo.name}`}
      style={
        isSelected
          ? {
              backgroundColor: 'var(--primary-light, #f4f4f5)',
              borderColor: 'var(--primary-color, #18181b)',
            }
          : undefined
      }
      className={`${TILE_BASE_CLASS} border transition ${
        isSelected
          ? 'ring-1 ring-black/20'
          : 'border-gray-200 bg-white hover:border-gray-400 hover:shadow-md'
      }`}
    >
      <QuantityBadge quantity={quantity} />
      {promo.image_url ? (
        <img
          src={productImageSrc(promo.image_url)}
          alt={promo.name}
          loading="lazy"
          className="w-10 h-10 rounded-xl object-cover bg-gray-100 shrink-0 shadow-2xs"
        />
      ) : (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[11px] uppercase shrink-0 shadow-2xs border"
          style={{
            backgroundColor: 'var(--primary-light, #f4f4f5)',
            borderColor: 'var(--primary-border, #e4e4e7)',
            color: 'var(--primary-text, #18181b)',
          }}
        >
          Promo
        </div>
      )}
      <span className="text-xs font-bold text-gray-900 leading-tight line-clamp-2">{promo.name}</span>
      <span className="text-xs font-bold" style={{ color: 'var(--primary-text, #18181b)' }}>
        {formatCurrency(promo.price)}
      </span>
    </button>
  );
}

function ProductTile({ product, quantity, onAdd }: { product: Product; quantity: number; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={quantity >= MAX_QUANTITY_PER_ITEM}
      title={`Agregar ${product.name}`}
      className={`${TILE_BASE_CLASS} ${
        quantity > 0 ? 'border-black bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-400 hover:shadow-md'
      }`}
    >
      <QuantityBadge quantity={quantity} />
      <ProductThumbnail product={product} size="sm" />
      <span className="text-xs font-semibold text-gray-900 leading-tight">{product.name}</span>
      {product.dietary_restrictions && product.dietary_restrictions.length > 0 && (
        <span className="flex flex-wrap gap-1 justify-center" aria-hidden="true">
          {product.dietary_restrictions.map((restriction) => (
            <span
              key={restriction}
              style={{
                backgroundColor: 'var(--primary-light, #f4f4f5)',
                borderColor: 'var(--primary-border, #e4e4e7)',
                color: 'var(--primary-text, #18181b)',
              }}
              className="rounded-full border text-[9px] font-semibold px-1.5 py-0.2"
            >
              {restriction}
            </span>
          ))}
        </span>
      )}
      <span className="text-xs text-gray-600">{formatCurrency(product.price)}</span>
    </button>
  );
}

interface CategoryChipsProps {
  categories: { id: number; name: string }[];
  promotionsCount: number;
  active: CategoryFilter;
  onChange: (category: CategoryFilter) => void;
}

function CategoryChips({ categories, promotionsCount, active, onChange }: CategoryChipsProps) {
  const allCategories = [{ id: ALL_CATEGORIES, name: 'Todas' } as const, ...categories];
  const promotionsActive = active === PROMOTIONS_CATEGORY;
  return (
    <div className="flex flex-wrap gap-2">
      {allCategories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onChange(category.id)}
          style={active === category.id ? PRIMARY_BACKGROUND : undefined}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
            active === category.id ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {category.name}
        </button>
      ))}
      {promotionsCount > 0 && (
        <button
          type="button"
          onClick={() => onChange(PROMOTIONS_CATEGORY)}
          style={
            promotionsActive
              ? PRIMARY_BACKGROUND
              : {
                  backgroundColor: 'var(--primary-light, #f4f4f5)',
                  borderColor: 'var(--primary-border, #e4e4e7)',
                  color: 'var(--primary-text, #18181b)',
                }
          }
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide transition border ${
            promotionsActive ? 'text-white shadow-md border-transparent' : 'hover:opacity-85'
          }`}
        >
          <span>Promociones</span>
        </button>
      )}
    </div>
  );
}

/** Las promociones que se muestran: solo en "Todas" y en "Promociones", y las que coinciden con la búsqueda. */
function filterPromotions(promotions: Promotion[], category: CategoryFilter, search: string): Promotion[] {
  if (category !== ALL_CATEGORIES && category !== PROMOTIONS_CATEGORY) return [];
  const term = search.trim().toLowerCase();
  const matches = (promo: Promotion) =>
    !term || promo.name.toLowerCase().includes(term) || Boolean(promo.description?.toLowerCase().includes(term));
  return promotions.filter(matches);
}

function filterProducts(products: Product[], category: CategoryFilter, search: string): Product[] {
  if (category === PROMOTIONS_CATEGORY) return [];
  const term = search.trim().toLowerCase();
  return products.filter(
    (product) =>
      (category === ALL_CATEGORIES || product.category.id === category) &&
      (!term || product.name.toLowerCase().includes(term))
  );
}

interface ProductCatalogProps {
  products: Product[];
  promotions: Promotion[];
  loadingProducts: boolean;
  loadingPromotions: boolean;
  /** Lo que ya tiene el pedido: cuántas unidades de cada producto y de cada promoción. */
  lines: CartItem[];
  error: string | null;
  onRetry: () => void;
  onAddProduct: (product: Product) => void;
  onAddPromotion: (promotion: Promotion) => void;
}

/** Catálogo del mostrador: buscador, categorías, promociones vigentes y productos para ir sumando al pedido. */
export function ProductCatalog({
  products,
  promotions,
  loadingProducts,
  loadingPromotions,
  lines,
  error,
  onRetry,
  onAddProduct,
  onAddPromotion,
}: ProductCatalogProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(ALL_CATEGORIES);
  const [search, setSearch] = useState('');

  const categories = useMemo(() => groupByCategory(products).map((group) => group.category), [products]);
  const visiblePromotions = useMemo(
    () => filterPromotions(promotions, activeCategory, search),
    [promotions, activeCategory, search]
  );
  const visibleGroups = useMemo(
    () => groupByCategory(filterProducts(products, activeCategory, search)),
    [products, activeCategory, search]
  );
  const quantityByProduct = useMemo(
    () => new Map(lines.filter((line) => !line.promotion).map((line) => [line.product.id, line.quantity])),
    [lines]
  );
  const quantityByPromo = useMemo(
    () =>
      new Map(
        lines
          .filter((line): line is CartItem & { promotion: Promotion } => Boolean(line.promotion))
          .map((line) => [line.promotion.id, line.quantity] as const)
      ),
    [lines]
  );
  const stillLoadingOrFailed = loadingProducts || loadingPromotions || Boolean(error);
  const nothingToShow = !stillLoadingOrFailed && visibleGroups.length === 0 && visiblePromotions.length === 0;

  return (
    <section className="lg:col-span-7 bg-white rounded-2xl shadow-md p-4 flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Productos</h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            // Enter en el buscador no debe confirmar el pedido.
            if (e.key === 'Enter') e.preventDefault();
          }}
          placeholder="Buscar producto…"
          aria-label="Buscar producto"
          className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      <CategoryChips
        categories={categories}
        promotionsCount={promotions.length}
        active={activeCategory}
        onChange={setActiveCategory}
      />

      {loadingProducts && products.length === 0 && <p className="text-sm text-gray-500 text-center py-12">Cargando menú...</p>}

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline hover:no-underline">
            Reintentar
          </button>
        </div>
      )}

      {nothingToShow && <p className="text-sm text-gray-500 text-center py-12">No hay productos que coincidan.</p>}

      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1 lg:max-h-none lg:flex-1 lg:min-h-40">
        {visiblePromotions.length > 0 && (
          <div>
            <h3
              className="text-xs font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--primary-text, #18181b)' }}
            >
              Promociones
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {visiblePromotions.map((promo) => (
                <PromotionTile
                  key={`promo-${promo.id}`}
                  promo={promo}
                  quantity={quantityByPromo.get(promo.id) ?? 0}
                  onAdd={() => onAddPromotion(promo)}
                />
              ))}
            </div>
          </div>
        )}

        {visibleGroups.map((group) => (
          <div key={group.category.id}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{group.category.name}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {group.products.map((product) => (
                <ProductTile
                  key={product.id}
                  product={product}
                  quantity={quantityByProduct.get(product.id) ?? 0}
                  onAdd={() => onAddProduct(product)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
