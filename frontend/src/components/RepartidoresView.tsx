import { useCallback, useState } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useToast } from '@/hooks/useToast';
import {
  createDeliveryDriver,
  fetchDeliveryDrivers,
  updateDeliveryDriver,
} from '@/services/deliveryDriverService';
import { DeliveryDriverModal } from '@/components/DeliveryDriverModal';
import { Toast } from '@/components/ui/Toast';
import type { DeliveryDriver, DeliveryDriverPayload } from '@/types/deliveryDriver';
import { getThemeOption, type ThemeColor } from '@/types/storeConfig';

interface RepartidoresViewProps {
  themeColor?: ThemeColor;
}

export function RepartidoresView({ themeColor }: RepartidoresViewProps) {
  const themeHex = themeColor ? getThemeOption(themeColor).hex : undefined;
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const toast = useToast();

  const fetchDriversCallback = useCallback(
    () => fetchDeliveryDrivers(),
    []
  );

  const { data: drivers = [], loading, error, reload } = useAsyncData(
    fetchDriversCallback,
    'No se pudo cargar la lista de repartidores.'
  );

  const handleOpenCreate = () => {
    setEditingDriver(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (driver: DeliveryDriver) => {
    setEditingDriver(driver);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDriver(null);
  };

  const handleSaveDriver = async (payload: DeliveryDriverPayload) => {
    if (editingDriver) {
      await updateDeliveryDriver(editingDriver.id, payload);
      toast.show('Repartidor actualizado exitosamente.');
    } else {
      await createDeliveryDriver(payload);
      toast.show('Repartidor registrado exitosamente.');
    }
    handleCloseModal();
    reload();
  };

  const filteredDrivers = drivers.filter((driver) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      driver.name.toLowerCase().includes(term) ||
      driver.phone.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 relative">
      <Toast message={toast.message} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Repartidores</h1>
          <p className="text-xs text-gray-500">
            Registro y control del personal de entregas a domicilio ({drivers.length} en total)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            style={themeHex ? { backgroundColor: themeHex } : undefined}
            className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl text-white transition shadow-xs ${
              themeHex ? 'hover:opacity-90' : 'bg-black hover:bg-gray-800'
            }`}
          >
            <span className="text-sm leading-none">+</span>
            Nuevo repartidor
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        {loading && drivers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Cargando repartidores...</p>
        ) : filteredDrivers.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-2">
            <p className="text-sm font-semibold text-gray-800">
              {search
                ? 'No se encontraron repartidores que coincidan con la búsqueda.'
                : 'Aún no hay repartidores registrados en el sistema.'}
            </p>
            <p className="text-xs text-gray-500">
              {!search && 'Registrá al personal de entregas para poder asignarle pedidos a domicilio.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="py-3 px-4">Nombre</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50/50 transition">
                    <td className="py-3.5 px-4 font-semibold text-gray-900">{driver.name}</td>
                    <td className="py-3.5 px-4 text-gray-600">{driver.phone}</td>
                    <td className="py-3.5 px-4">
                      {driver.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(driver)}
                        className="text-xs font-bold text-gray-700 hover:text-black bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <DeliveryDriverModal
          driver={editingDriver}
          onClose={handleCloseModal}
          onSave={handleSaveDriver}
        />
      )}
    </div>
  );
}

