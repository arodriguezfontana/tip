import { useMemo, useState } from 'react';
import { ProductFormModal } from '@/components/ProductFormModal';
import { ProductsTable } from '@/components/ProductsTable';
import { RecipeEditModal } from '@/components/RecipeEditModal';
import { Toast } from '@/components/ui/Toast';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useToast } from '@/hooks/useToast';
import {
  createProduct,
  deleteProductImage,
  fetchAdminProducts,
  fetchCategories,
  updateProduct,
  uploadProductImage,
} from '@/services/catalogService';
import { fetchIngredients, updateProductRecipe } from '@/services/ingredientService';
import { INPUT_CLASS } from '@/styles/forms';
import type { AdminCategory, AdminProduct, ImageChange, ProductPayload } from '@/types/catalog';
import type { Ingredient, RecipeItemPayload } from '@/types/ingredient';
import { getErrorMessage } from '@/utils/errors';

const ALL = 'all';
const WITHOUT_CATEGORY = 'none';

/** El formulario abierto: producto a editar, o null para crear uno nuevo. */
type ProductForm = { product: AdminProduct | null } | null;

function matches(
  product: AdminProduct,
  search: string,
  categoryFilter: string,
  restrictionFilter: string
): boolean {
  const text = search.trim().toLowerCase();
  if (text && !`${product.name} ${product.description ?? ''}`.toLowerCase().includes(text)) return false;
  if (categoryFilter !== ALL) {
    if (categoryFilter === WITHOUT_CATEGORY) {
      if (product.category !== null) return false;
    } else if (product.category?.id !== Number(categoryFilter)) {
      return false;
    }
  }
  if (restrictionFilter !== ALL) {
    const target = restrictionFilter.toLowerCase().trim();
    const hasMatch = (product.dietary_restrictions ?? []).some(
      (r) => r.toLowerCase().trim() === target || r.toLowerCase().trim().includes(target)
    );
    if (!hasMatch) return false;
  }
  return true;
}

async function applyImageChange(product: AdminProduct, image: ImageChange): Promise<AdminProduct> {
  if (image.type === 'upload') return uploadProductImage(product.id, image.file);
  if (image.type === 'remove') return deleteProductImage(product.id);
  return product;
}

interface CatalogData {
  products: AdminProduct[];
  categories: AdminCategory[];
  ingredients: Ingredient[];
}

async function loadCatalog(): Promise<CatalogData> {
  const [products, categories, ingredients] = await Promise.all([
    fetchAdminProducts(),
    fetchCategories(),
    fetchIngredients(),
  ]);
  return { products, categories, ingredients };
}

/** Reemplaza el producto en el listado, o lo agrega al final si es nuevo. */
function upsertProduct(products: AdminProduct[], saved: AdminProduct): AdminProduct[] {
  return products.some((product) => product.id === saved.id)
    ? products.map((product) => (product.id === saved.id ? saved : product))
    : [...products, saved];
}

export function ProductosView() {
  const catalog = useAsyncData(loadCatalog, 'No se pudieron cargar los productos.');
  const { products = [], categories = [], ingredients = [] } = catalog.data ?? {};
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [restrictionFilter, setRestrictionFilter] = useState(ALL);
  const [productForm, setProductForm] = useState<ProductForm>(null);
  const [recipeProduct, setRecipeProduct] = useState<AdminProduct | null>(null);
  const toast = useToast();

  const availableRestrictions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const r of p.dietary_restrictions ?? []) {
        if (r && r.trim()) set.add(r.trim());
      }
    }
    ['vegetariano', 'vegano', 'sin TACC'].forEach((def) => set.add(def));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const upsert = (saved: AdminProduct) =>
    catalog.update((data) => data && { ...data, products: upsertProduct(data.products, saved) });

  const handleSaveProduct = async (payload: ProductPayload, image: ImageChange) => {
    const editing = productForm?.product ?? null;
    // Si falla, el error se muestra en el formulario, que queda abierto.
    const saved = editing ? await updateProduct(editing.id, payload) : await createProduct(payload);
    upsert(saved);
    setActionError(null);

    // El producto ya quedó guardado: si falla la imagen se avisa aparte (reintentar crearía un duplicado).
    try {
      upsert(await applyImageChange(saved, image));
    } catch (err) {
      setProductForm(null);
      setActionError(
        `Se guardó ${saved.name}, pero no se pudo actualizar la imagen: ${getErrorMessage(err, 'error inesperado.')}`
      );
      return;
    }
    setProductForm(null);
    toast.show(editing ? `Se guardaron los cambios de ${saved.name}.` : `Se creó el producto ${saved.name}.`);
  };

  const handleSaveRecipe = async (items: RecipeItemPayload[]) => {
    if (!recipeProduct) return;
    const updated = await updateProductRecipe(recipeProduct.id, items);
    upsert(updated);
    setRecipeProduct(null);
    toast.show(`Se guardó la receta de ${updated.name}.`);
  };

  const visibleProducts = products.filter((product) =>
    matches(product, search, categoryFilter, restrictionFilter)
  );
  const withoutRecipe = products.filter((product) => product.recipe.length === 0).length;
  const withoutCategory = products.filter((product) => product.category === null);

  return (
    <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
      <Toast message={toast.message} />

      <div className="shrink-0 bg-white p-4 rounded-2xl shadow-xs border border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            aria-label="Buscar producto"
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLASS} flex-1`}
          />
          <select
            aria-label="Filtrar por categoría"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`${INPUT_CLASS} bg-white sm:w-48`}
          >
            <option value={ALL}>Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            {withoutCategory.length > 0 && <option value={WITHOUT_CATEGORY}>Sin categoría</option>}
          </select>
          <select
            aria-label="Filtrar por restricción"
            value={restrictionFilter}
            onChange={(e) => setRestrictionFilter(e.target.value)}
            className={`${INPUT_CLASS} bg-white sm:w-48`}
          >
            <option value={ALL}>Todas las restricciones</option>
            {availableRestrictions.map((restriction) => (
              <option key={restriction} value={restriction}>
                {restriction}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setProductForm({ product: null })}
            disabled={catalog.loading}
            style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
            className="text-white rounded-xl px-5 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 whitespace-nowrap"
          >
            + Crear producto
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {products.length === 1 ? '1 producto' : `${products.length} productos`} en el catálogo. Con las recetas se
          calcula el consumo de ingredientes de los pedidos finalizados.
          {withoutRecipe > 0 && ` Hay ${withoutRecipe} ${withoutRecipe === 1 ? 'producto' : 'productos'} sin receta.`}
        </p>
      </div>

      {withoutCategory.length > 0 && (
        <div className="shrink-0 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 px-4 py-3 text-sm">
          {withoutCategory.length === 1 ? 'Este producto no tiene' : 'Estos productos no tienen'} categoría y no se
          muestran en el menú: <strong>{withoutCategory.map((product) => product.name).join(', ')}</strong>. Editalos
          para asignarles una.
        </div>
      )}

      {(actionError || catalog.error) && (
        <div role="alert" className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {actionError || catalog.error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col lg:min-h-48">
        {catalog.loading && products.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Cargando productos...</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Todavía no hay productos en el catálogo.</p>
        ) : visibleProducts.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">No hay productos que coincidan.</p>
        ) : (
          <ProductsTable products={visibleProducts} onEdit={(product) => setProductForm({ product })} onEditRecipe={setRecipeProduct} />
        )}
      </div>

      {productForm && (
        <ProductFormModal
          product={productForm.product}
          categories={categories}
          availableIngredients={ingredients}
          onClose={() => setProductForm(null)}
          onSave={handleSaveProduct}
        />
      )}

      {recipeProduct && (
        <RecipeEditModal
          product={recipeProduct}
          ingredients={ingredients}
          onClose={() => setRecipeProduct(null)}
          onSave={handleSaveRecipe}
        />
      )}
    </div>
  );
}
