import { useEffect, useState } from 'react';
import { PromotionFormModal } from '@/components/PromotionFormModal';
import { PanelNote } from '@/components/ui/PanelNote';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import { fetchAdminProducts } from '@/services/catalogService';
import {
  createPromotion,
  deletePromotion,
  deletePromotionImage,
  fetchPromotions,
  updatePromotion,
  uploadPromotionImage,
} from '@/services/promotionService';
import { INPUT_CLASS } from '@/styles/forms';
import type { AdminProduct, ImageChange } from '@/types/catalog';
import type { Promotion, PromotionPayload } from '@/types/promotion';
import { productImageSrc } from '@/utils/catalog';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';

export function PromocionesView() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalPromotion, setModalPromotion] = useState<{ promo: Promotion | null } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPromotions(), fetchAdminProducts()])
      .then(([promosData, prodsData]) => {
        if (!cancelled) {
          setPromotions(promosData);
          setProducts(prodsData);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('No se pudieron cargar las promociones.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSavePromotion = async (payload: PromotionPayload, image: ImageChange) => {
    const editing = modalPromotion?.promo;
    let saved: Promotion;
    if (editing) {
      saved = await updatePromotion(editing.id, payload);
      toast.show(`Se actualizó la promoción "${saved.name}".`);
    } else {
      saved = await createPromotion(payload);
      toast.show(`Se creó la promoción "${saved.name}".`);
    }

    if (image.type === 'upload') {
      saved = await uploadPromotionImage(saved.id, image.file);
    } else if (image.type === 'remove' && editing?.image_url) {
      saved = await deletePromotionImage(saved.id);
    }

    setPromotions((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      if (exists) {
        return prev.map((p) => (p.id === saved.id ? saved : p));
      }
      return [saved, ...prev];
    });
    setModalPromotion(null);
  };

  const handleToggleActive = async (promo: Promotion) => {
    setTogglingId(promo.id);
    setActionError(null);
    try {
      const updated = await updatePromotion(promo.id, {
        name: promo.name,
        description: promo.description,
        price: promo.price,
        is_active: !promo.is_active,
        items: promo.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
      });
      setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.show(
        updated.is_active
          ? `La promoción "${updated.name}" ahora está activa.`
          : `La promoción "${updated.name}" fue pausada.`
      );
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo cambiar el estado de la promoción.'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setActionError(null);
    try {
      await deletePromotion(id);
      setPromotions((prev) => prev.filter((p) => p.id !== id));
      toast.show('Se eliminó la promoción.');
      setDeletingId(null);
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo eliminar la promoción.'));
    }
  };

  const filtered = promotions.filter((p) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const matchName = p.name.toLowerCase().includes(term);
    const matchDesc = p.description?.toLowerCase().includes(term);
    const matchItems = p.items.some((it) => it.product_name?.toLowerCase().includes(term));
    return matchName || matchDesc || matchItems;
  });

  return (
    <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
      <Toast message={toast.message} />

      {/* Barra de búsqueda y botón nuevo */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <input
            type="text"
            placeholder="Buscar promoción..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <button
          type="button"
          onClick={() => setModalPromotion({ promo: null })}
          className="w-full sm:w-auto px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1.5 shadow-xs"
        >
          <span className="text-base font-bold leading-none">+</span> Nueva promoción
        </button>
      </div>

      {actionError && (
        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-2.5 text-xs font-semibold">
          {actionError}
        </div>
      )}

      {loading && <PanelNote>Cargando promociones...</PanelNote>}
      {loadError && (
        <div className="rounded-xl bg-red-50 text-red-700 p-4 text-sm font-semibold">
          {loadError}
        </div>
      )}

      {!loading && !loadError && (
        <div className="flex-1 overflow-y-auto">
          {promotions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-3">
              <h3 className="text-sm font-bold text-gray-900">No hay promociones cargadas</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Creá combos y ofertas especiales seleccionando los productos incluidos y el precio promocional.
              </p>
              <button
                type="button"
                onClick={() => setModalPromotion({ promo: null })}
                className="mt-2 px-4 py-2 bg-black text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition"
              >
                Crear primera promoción
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-xs text-gray-500">
              No se encontraron promociones que coincidan con &quot;{search}&quot;.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((promo) => (
                <div
                  key={promo.id}
                  className={`bg-white rounded-2xl border transition-all p-5 flex flex-col justify-between gap-4 shadow-2xs ${
                    promo.is_active ? 'border-gray-200 hover:border-gray-300' : 'border-gray-200/60 opacity-70 bg-gray-50/40'
                  }`}
                >
                  <div className="space-y-2">
                    {promo.image_url && (
                      <div className="w-full h-36 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 mb-2">
                        <img
                          src={productImageSrc(promo.image_url)}
                          alt={promo.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-gray-900 text-base leading-snug">
                        {promo.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(promo)}
                        disabled={togglingId === promo.id}
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition ${
                          promo.is_active
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Clic para cambiar estado"
                      >
                        {promo.is_active ? 'Activa' : 'Pausada'}
                      </button>
                    </div>

                    {promo.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {promo.description}
                      </p>
                    )}

                    <div className="text-lg font-black text-gray-900 pt-1">
                      {formatCurrency(promo.price)}
                    </div>

                    {/* Productos incluidos */}
                    <div className="pt-2 border-t border-gray-100 space-y-1.5">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        Incluye:
                      </span>
                      <ul className="flex flex-wrap gap-1.5">
                        {promo.items.map((it) => (
                          <li
                            key={it.product_id}
                            className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-lg font-medium"
                          >
                            <span className="font-bold text-black">{it.quantity}x</span>{' '}
                            {it.product_name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    {deletingId === promo.id ? (
                      <div className="flex items-center gap-1.5 text-xs w-full justify-end">
                        <span className="text-red-600 font-semibold text-xs">¿Eliminar?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(promo.id)}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-xs transition"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 rounded-lg text-xs transition"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setModalPromotion({ promo })}
                          className="text-xs font-semibold text-gray-700 hover:text-black hover:bg-gray-100 px-3 py-1.5 rounded-lg transition"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(promo.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition"
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalPromotion && (
        <PromotionFormModal
          promotion={modalPromotion.promo}
          products={products}
          onClose={() => setModalPromotion(null)}
          onSave={handleSavePromotion}
        />
      )}
    </div>
  );
}
