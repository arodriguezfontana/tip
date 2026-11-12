import { useState } from 'react';
import { INPUT_FULL_CLASS as INPUT_CLASS } from '@/styles/forms';
import type { AdminProduct } from '@/types/catalog';
import { formatCurrency } from '@/utils/currency';

export interface PromotionLine {
  product_id: number;
  quantity: number;
}

/** Suma las unidades a la línea de ese producto o, si no está, la agrega. */
function withProduct(lines: PromotionLine[], productId: number, quantity: number): PromotionLine[] {
  if (!lines.some((line) => line.product_id === productId)) return [...lines, { product_id: productId, quantity }];
  return lines.map((line) => (line.product_id === productId ? { ...line, quantity: line.quantity + quantity } : line));
}

/** Cambia la cantidad de un producto; con cantidad cero el producto se quita. */
function withQuantityChange(lines: PromotionLine[], productId: number, delta: number): PromotionLine[] {
  return lines
    .map((line) => (line.product_id === productId ? { ...line, quantity: line.quantity + delta } : line))
    .filter((line) => line.quantity > 0);
}

function LineRow({
  line,
  product,
  onChangeQuantity,
  onRemove,
}: {
  line: PromotionLine;
  product?: AdminProduct;
  onChangeQuantity: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <li className="p-3 flex items-center justify-between text-sm">
      <div className="flex flex-col">
        <span className="font-semibold text-gray-800">{product ? product.name : `Producto #${line.product_id}`}</span>
        {product && <span className="text-xs text-gray-500">{formatCurrency(product.price)} c/u</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden shadow-2xs">
          <button
            type="button"
            onClick={() => onChangeQuantity(-1)}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 text-xs font-bold"
          >
            -
          </button>
          <span className="px-2 py-1 text-xs font-bold min-w-6 text-center">{line.quantity}</span>
          <button
            type="button"
            onClick={() => onChangeQuantity(1)}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 text-xs font-bold"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition"
          title="Quitar de la promo"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

interface PromotionItemsEditorProps {
  products: AdminProduct[];
  items: PromotionLine[];
  onChange: (items: PromotionLine[]) => void;
}

/** Los productos (y cantidades) que componen una promoción. */
export function PromotionItemsEditor({ products, items, onChange }: PromotionItemsEditorProps) {
  const [productToAdd, setProductToAdd] = useState<number | ''>('');
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const productById = new Map(products.map((product) => [product.id, product]));

  const handleAdd = () => {
    if (productToAdd === '') return;
    onChange(withProduct(items, Number(productToAdd), quantityToAdd));
    setProductToAdd('');
    setQuantityToAdd(1);
  };

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <h3 className="text-sm font-bold text-gray-900">Productos incluidos</h3>
      <p className="text-xs text-gray-500">
        Elegí los productos y las cantidades que componen esta promo. Se unifican en la comanda de cocina.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          aria-label="Producto a agregar"
          value={productToAdd}
          onChange={(e) => setProductToAdd(e.target.value === '' ? '' : Number(e.target.value))}
          className={`flex-1 ${INPUT_CLASS} bg-white`}
        >
          <option value="">Seleccionar un producto del catálogo...</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} ({formatCurrency(product.price)})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            max="20"
            aria-label="Cantidad"
            value={quantityToAdd}
            onChange={(e) => setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 1))}
            className={`w-20 ${INPUT_CLASS} text-center`}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={productToAdd === ''}
            className="px-4 py-2 bg-gray-900 hover:bg-black disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition"
          >
            Agregar
          </button>
        </div>
      </div>

      <div className="space-y-2 mt-2">
        {items.length === 0 ? (
          <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">
            Todavía no sumaste ningún producto a esta promoción.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
            {items.map((line) => (
              <LineRow
                key={line.product_id}
                line={line}
                product={productById.get(line.product_id)}
                onChangeQuantity={(delta) => onChange(withQuantityChange(items, line.product_id, delta))}
                onRemove={() => onChange(items.filter((item) => item.product_id !== line.product_id))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
