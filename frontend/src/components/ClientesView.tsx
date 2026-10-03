import { useEffect, useState, useCallback } from 'react';
import { fetchClients, updateClient } from '@/services/clientService';
import { ClientEditModal } from '@/components/ClientEditModal';
import type { Client } from '@/types/client';

export function ClientesView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchClients({
        search: debouncedSearch || undefined,
        page,
        per_page: perPage,
      });
      setClients(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setError(null);
    } catch {
      setError('No se pudo cargar el listado de clientes.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, perPage]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleSaveClient = async (id: number, data: { full_name: string; phone: string; address: string | null }) => {
    await updateClient(id, data);
    setToastMessage('Los datos del cliente se actualizaron exitosamente.');
    setTimeout(() => setToastMessage(null), 4000);

    setEditingClient(null);
    loadClients();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 relative">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-green-50 text-green-800 border border-green-200 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold transition">
          {toastMessage}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Clientes</h1>
          <p className="text-xs text-gray-500">Base de datos de clientes registrados en el local ({total} en total)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black"
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
          <div className="text-center py-16 px-4 space-y-2">
            <p className="text-sm font-semibold text-gray-800">
              {debouncedSearch ? 'No se encontraron clientes que coincidan con la búsqueda.' : 'Aún no hay clientes registrados en el sistema.'}
            </p>
            <p className="text-xs text-gray-500">
              {!debouncedSearch && 'Los clientes se guardarán automáticamente al cargar sus pedidos.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-5">Nombre del Cliente</th>
                  <th className="py-3 px-5">Teléfono</th>
                  <th className="py-3 px-5">Dirección</th>
                  <th className="py-3 px-5">Registrado</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50/50 transition">
                    <td className="py-3.5 px-5 font-semibold text-gray-900">{client.full_name}</td>
                    <td className="py-3.5 px-5 text-gray-600">{client.phone}</td>
                    <td className="py-3.5 px-5 text-gray-600">{client.address || <span className="text-gray-400 italic">Sin dirección</span>}</td>
                    <td className="py-3.5 px-5 text-gray-400">{new Date(client.created_at).toLocaleDateString()}</td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingClient(client)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 transition"
                        title="Editar cliente"
                      >
                        <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
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
              className="font-semibold text-gray-700 disabled:opacity-30 hover:underline"
            >
              Anterior
            </button>
            <span className="text-gray-500 font-medium">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="font-semibold text-gray-700 disabled:opacity-30 hover:underline"
            >
              Siguiente
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