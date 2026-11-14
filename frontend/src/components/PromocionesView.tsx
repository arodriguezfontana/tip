import { useEffect, useState } from 'react';
import { PromotionAdminCard } from '@/components/PromotionAdminCard';
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
import { getErrorMessage } from '@/utils/errors';

/** La promoción coincide con lo buscado en su nombre, su descripción o los productos que incluye. */
function matchesSearch(promotion: Promotion, search: string): boolean {
  const term = search.trim().toLowerCase();
  const matchesTerm = (text?: string | null) => Boolean(text?.toLowerCase().includes(term));
  return !term || matchesTerm(promotion.name) || matchesTerm(promotion.description) || promotion.items.some((item) => matchesTerm(item.product_name));
}

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

  const filtered = promotions.filter((promotion) => matchesSearch(promotion, search));

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
          style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
          className="w-full sm:w-auto px-4 py-2 hover:opacity-90 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1.5 shadow-xs"
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
                style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
                className="mt-2 px-4 py-2 hover:opacity-90 text-white rounded-xl text-xs font-semibold transition"
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
                <PromotionAdminCard
                  key={promo.id}
                  promo={promo}
                  toggling={togglingId === promo.id}
                  confirmingDelete={deletingId === promo.id}
                  onToggleActive={() => handleToggleActive(promo)}
                  onEdit={() => setModalPromotion({ promo })}
                  onAskDelete={() => setDeletingId(promo.id)}
                  onCancelDelete={() => setDeletingId(null)}
                  onDelete={() => handleDelete(promo.id)}
                />
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
