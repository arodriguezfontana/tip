import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Client } from '@/types/client';
import { getErrorMessage } from '@/utils/customerValidation';

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black';

interface ClientEditModalProps {
  client: Client;
  onClose: () => void;
  onSave: (id: number, data: { full_name: string; phone: string; address: string | null }) => Promise<void>;
}

export function ClientEditModal({ client, onClose, onSave }: ClientEditModalProps) {
  const [fullName, setFullName] = useState(client.full_name);
  const [phone, setPhone] = useState(client.phone);
  const [address, setAddress] = useState(client.address ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!fullName.trim() || !phone.trim()) {
      setFormError('El nombre y el teléfono son obligatorios.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onSave(client.id, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        address: address.trim() || null,
      });
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo actualizar el cliente.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="text-base font-bold text-gray-900">Editar Cliente #{client.id}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-700 text-lg font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Sin dirección"
            />
          </div>

          {formError && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-xs font-semibold hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-black text-white rounded-xl py-2.5 text-xs font-semibold hover:bg-gray-800 transition disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}