import { useEffect, useState } from 'react';
import { RecipeEditModal } from '@/components/RecipeEditModal';
import { fetchIngredients, fetchProductsWithRecipes, updateProductRecipe } from '@/services/ingredientService';
import type { Ingredient, ProductWithRecipe, RecipeItemPayload } from '@/types/ingredient';
import { formatQuantity } from '@/utils/ingredients';

export function ProductosView() {
  const [products, setProducts] = useState<ProductWithRecipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductWithRecipe | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProductsWithRecipes(), fetchIngredients()])
      .then(([productsData, ingredientsData]) => {
        if (cancelled) return;
        setProducts(productsData);
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

  const handleSaveRecipe = async (items: RecipeItemPayload[]) => {
    if (!editingProduct) return;
    const updated = await updateProductRecipe(editingProduct.id, items);
    setProducts((current) => current.map((product) => (product.id === updated.id ? updated : product)));
    setEditingProduct(null);
    setToastMessage(`Se guardó la receta de ${updated.name}.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const withoutRecipe = products.filter((product) => product.recipe.length === 0).length;

  return (
    <div className="flex flex-col gap-4 lg:h-full relative">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-green-50 text-green-800 border border-green-200 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold transition">
          {toastMessage}
        </div>
      )}

      <div className="shrink-0 bg-white p-5 rounded-2xl shadow-xs border border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Productos y recetas</h1>
        <p className="text-xs text-gray-500">
          Asociá a cada producto los ingredientes que lleva una unidad. Con las recetas se calcula el consumo de
          ingredientes de los pedidos finalizados.
          {withoutRecipe > 0 && ` Hay ${withoutRecipe} ${withoutRecipe === 1 ? 'producto' : 'productos'} sin receta.`}
        </p>
      </div>

      {error && <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col lg:min-h-0">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-16">Cargando productos...</p>
        ) : (
          <div className="overflow-auto lg:min-h-0">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-5">Producto</th>
                  <th className="py-3 px-5">Categoría</th>
                  <th className="py-3 px-5">Receta (por unidad)</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50/50 align-top">
                    <td className="py-3 px-5 font-semibold text-gray-900">
                      {product.name}
                      {!product.is_active && (
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          No disponible
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-gray-600">{product.category.name}</td>
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
                    <td className="py-3 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(product)}
                        aria-label={`Editar receta de ${product.name}`}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 text-gray-700 border border-gray-300 hover:bg-gray-100 whitespace-nowrap"
                      >
                        Editar receta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingProduct && (
        <RecipeEditModal
          product={editingProduct}
          ingredients={ingredients}
          onClose={() => setEditingProduct(null)}
          onSave={handleSaveRecipe}
        />
      )}
    </div>
  );
}
