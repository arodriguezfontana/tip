import { useEffect, useState } from 'react';
import { StarIcon } from '@/components/Icons';
import { fetchDriverReviews } from '@/services/deliveryDriverService';
import type { DeliveryDriver, DriverReviewsDetail } from '@/types/deliveryDriver';
import { formatDayAndTime } from '@/utils/dateTime';

interface DriverReviewsModalProps {
  driver: DeliveryDriver;
  onClose: () => void;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          className={`w-4 h-4 ${
            star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-100'
          }`}
        />
      ))}
      <span className="ml-1 text-xs font-bold text-gray-700">{rating}/5</span>
    </div>
  );
}

export function DriverReviewsModal({ driver, onClose }: DriverReviewsModalProps) {
  const [data, setData] = useState<DriverReviewsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchDriverReviews(driver.id)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.response?.data?.detail || 'No se pudieron cargar las reseñas del repartidor.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [driver.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-reviews-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 id="driver-reviews-title" className="text-lg font-bold text-gray-900">
              Reseñas de {driver.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Opiniones y calificaciones de clientes (anónimas)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de reseñas"
            className="w-8 h-8 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center text-xl transition"
          >
            ×
          </button>
        </header>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {/* Métricas del repartidor */}
          <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-100 text-center">
            <div className="p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Puntaje</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <StarIcon className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span className="text-xl font-bold text-gray-900">
                  {data?.rating_average !== null && data?.rating_average !== undefined
                    ? data.rating_average.toFixed(1)
                    : '-'}
                </span>
              </div>
            </div>
            <div className="p-2 border-x border-gray-200">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Entregados</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{data?.delivered_orders_count ?? 0}</p>
            </div>
            <div className="p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Reseñas</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{data?.reviews_count ?? 0}</p>
            </div>
          </div>

          {/* Listado de reseñas */}
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-10">Cargando reseñas...</p>
          ) : error ? (
            <div role="alert" className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          ) : !data || data.reviews.length === 0 ? (
            <div className="text-center py-10">
              <StarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">El repartidor todavía no recibió reseñas.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.reviews.map((rev) => (
                <li
                  key={rev.id}
                  className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    {rev.rating !== null ? (
                      <StarRating rating={rev.rating} />
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                        Solo comentario
                      </span>
                    )}
                    <span className="text-[11px] text-gray-600 font-medium">
                      {formatDayAndTime(rev.created_at)}
                    </span>
                  </div>
                  {rev.comment ? (
                    <p className="text-sm text-gray-800 italic bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
                      «{rev.comment}»
                    </p>
                  ) : (
                    <p className="text-xs text-gray-600 italic">Calificación sin comentario</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-black hover:bg-gray-800 text-white text-xs font-bold transition"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
