import { useEffect, useState } from 'react';
import { ProductFormModal } from '@/components/ProductFormModal';
import { ProductThumbnail } from '@/components/ProductThumbnail';
import { RecipeEditModal } from '@/components/RecipeEditModal';
import {
  createProduct,
  deleteProductImage,
  fetchAdminProducts,
  fetchCategories,
  updateProduct,
  uploadProductImage,
} from '@/services/catalogService';
import { fetchIngredients, updateProductRecipe } from '@/services/ingredientService';
import type { AdminCategory, AdminProduct, ImageChange, ProductPayload } from '@/types/catalog';
import type { Ingredient, RecipeItemPayload } from '@/types/ingredient';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/customerValidation';
import { formatQuantity } from '@/utils/ingredients';

const INPUT_CLASS =
  'rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black';

const ALL = 'all';
const WITHOUT_CATEGORY = 'none';

/** El formulario abierto: producto a editar, o null para crear uno nuevo. */
type ProductForm = { product: AdminProduct | null } | null;

function matches(product: AdminProduct, search: string, categoryFilter: string): boolean {
  const text = search.trim().toLowerCase();
  if (text && !`${product.name} ${product.description ?? ''}`.toLowerCase().includes(text)) return false;
  if (categoryFilter === ALL) return true;
  if (categoryFilter === WITHOUT_CATEGORY) return product.category === null;
  return product.category?.id === Number(categoryFilter);
}

async function applyImageChange(product: AdminProduct, image: ImageChange): Promise<AdminProduct> {
  if (image.type === 'upload') return uploadProductImage(product.id, image.file);
  if (image.type === 'remove') return deleteProductImage(product.id);
  return product;
}

export function ProductosView() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [productForm, setProductForm] = useState<ProductForm>(null);
  const [recipeProduct, setRecipeProduct] = useState<AdminProduct | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAdminProducts(), fetchCategories(), fetchIngredients()])
      .then(([productsData, categoriesData, ingredientsData]) => {
        if (cancelled) return;
        setProducts(productsData);
        setCategories(categoriesData);
        setIngredients(ingredientsData);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los productos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  /** Reemplaza el producto en el listado, o lo agrega al final si es nuevo. */
  const upsert = (saved: AdminProduct) =>
    setProducts((current) =>
      current.some((product) => product.id === saved.id)
        ? current.map((product) => (product.id === saved.id ? saved : product))
        : [...current, saved]
    );

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
    showToast(editing ? `Se guardaron los cambios de ${saved.name}.` : `Se creó el producto ${saved.name}.`);
  };

  const handleSaveRecipe = async (items: RecipeItemPayload[]) => {
    if (!recipeProduct) return;
    const updated = await updateProductRecipe(recipeProduct.id, items);
    upsert(updated);
    setRecipeProduct(null);
    showToast(`Se guardó la receta de ${updated.name}.`);
  };

  const visibleProducts = products.filter((product) => matches(product, search, categoryFilter));
  const withoutRecipe = products.filter((product) => product.recipe.length === 0).length;
  const withoutCategory = products.filter((product) => product.category === null);

  return (
    <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-green-50 text-green-800 border border-green-200 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold transition">
          {toastMessage}
        </div>
      )}

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
            className={`${INPUT_CLASS} bg-white sm:w-52`}
          >
            <option value={ALL}>Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            {withoutCategory.length > 0 && <option value={WITHOUT_CATEGORY}>Sin categoría</option>}
          </select>
          <button
            type="button"
            onClick={() => setProductForm({ product: null })}
            disabled={loading}
            className="bg-black text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-60 whitespace-nowrap"
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

      {(actionError || error) && (
        <div role="alert" className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {actionError || error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col lg:min-h-0">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-16">Cargando productos...</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Todavía no hay productos en el catálogo.</p>
        ) : visibleProducts.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">No hay productos que coincidan.</p>
        ) : (
          <div className="overflow-auto lg:min-h-0">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-5">Producto</th>
                  <th className="py-3 px-5">Categoría</th>
                  <th className="py-3 px-5 text-right">Precio</th>
                  <th className="py-3 px-5">Receta (por unidad)</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50/50 align-top">
                    <td className="py-3 px-5">
                      <div className="flex gap-3 min-w-56">
                        <ProductThumbnail product={product} size="sm" />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">
                            {product.name}
                            {!product.is_active && (
                              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                No disponible
                              </span>
                            )}
                          </p>
                          {product.description && (
                            <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-gray-600">
                      {product.category ? (
                        product.category.name
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 whitespace-nowrap">
                          Sin categoría
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="py-3 px-5 text-gray-600">
                      {product.recipe.length === 0 ? (
                        <span className="text-gray-400 italic">Sin receta</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {product.recipe.map((item) => (
                            <li key={item.ingredient_id}>
                              {item.ingredient_name}: {formatQuantity(item.quantity, item.unit)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => setProductForm({ product })}
                        aria-label={`Editar ${product.name}`}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-200"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecipeProduct(product)}
                        aria-label={`Editar receta de ${product.name}`}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 text-gray-700 border border-gray-300 hover:bg-gray-100"
                      >
                        Receta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {productForm && (
        <ProductFormModal
          product={productForm.product}
          categories={categories}
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
