import { useCallback, useEffect, useState } from 'react';
import { fetchClients, updateClient } from '@/services/clientService';
import { ClientEditModal } from '@/components/ClientEditModal';
import { Toast } from '@/components/ui/Toast';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useToast } from '@/hooks/useToast';
import { EditIcon, SearchIcon, UserIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/Icons';
import type { Client } from '@/types/client';

export function ClientesView() {
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(10);

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const listing = useAsyncData(
    useCallback(
      () => fetchClients({ search: debouncedSearch || undefined, page, per_page: perPage }),
      [debouncedSearch, page, perPage]
    ),
    'No se pudo cargar el listado de clientes.'
  );
  const { loading, error } = listing;
  const clients = listing.data?.items ?? [];
  const total = listing.data?.total ?? 0;
  const totalPages = listing.data?.total_pages ?? 1;

  const handleSaveClient = async (id: number, data: { full_name: string; phone: string; address: string | null }) => {
    await updateClient(id, data);
    toast.show('Los datos del cliente se actualizaron exitosamente.');
    setEditingClient(null);
    listing.reload();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 relative">
      <Toast message={toast.message} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Clientes</h1>
          <p className="text-xs text-gray-500">Base de datos de clientes registrados en el local ({total} en total)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400" aria-hidden="true">
              <SearchIcon className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o dirección..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black transition"
            />
          </div>

          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 shrink-0">
            <span className="text-xs text-gray-500 font-medium">Ver:</span>
            {[10, 20, 30].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => { setPerPage(size); setPage(1); }}
                className={`text-xs px-2 py-0.5 rounded-lg font-bold transition ${perPage === size ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        {loading && clients.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Cargando clientes...</p>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-3 flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400" aria-hidden="true">
              <UserIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {debouncedSearch ? 'No se encontraron clientes que coincidan con la búsqueda.' : 'Aún no hay clientes registrados en el sistema.'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {!debouncedSearch && 'Los clientes se guardarán automáticamente al cargar sus pedidos.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[650px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="w-52 py-3 px-5">Nombre del Cliente</th>
                  <th className="w-36 py-3 px-5">Teléfono</th>
                  <th className="py-3 px-5">Dirección</th>
                  <th className="w-32 py-3 px-5">Registrado</th>
                  <th className="w-24 py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50/50 transition">
                    <td className="py-3.5 px-5 font-semibold text-gray-900 truncate" title={client.full_name}>{client.full_name}</td>
                    <td className="py-3.5 px-5 text-gray-600 whitespace-nowrap">{client.phone}</td>
                    <td className="py-3.5 px-5 text-gray-600 truncate">{client.address || <span className="text-gray-400 italic">Sin dirección</span>}</td>
                    <td className="py-3.5 px-5 text-gray-400 whitespace-nowrap">{new Date(client.created_at).toLocaleDateString()}</td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingClient(client)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 transition"
                        title="Editar cliente"
                      >
                        <EditIcon className="w-4 h-4 inline-block" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/30 text-xs">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="inline-flex items-center gap-1 font-semibold text-gray-700 disabled:opacity-30 hover:underline"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Anterior</span>
            </button>
            <span className="text-gray-500 font-medium">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="inline-flex items-center gap-1 font-semibold text-gray-700 disabled:opacity-30 hover:underline"
            >
              <span>Siguiente</span>
              <ChevronRightIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {editingClient && (
        <ClientEditModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSave={handleSaveClient}
        />
      )}
    </div>
  );
}