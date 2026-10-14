import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { INPUT_LG_CLASS, LABEL_CLASS } from '@/styles/forms';
import type { Client } from '@/types/client';
import { getErrorMessage } from '@/utils/errors';

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
    <Modal title={`Editar Cliente #${client.id}`} onClose={onClose} closeDisabled={saving} width="md">
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0" noValidate>
        <ModalBody>
          <div>
            <label htmlFor="client-full-name" className={LABEL_CLASS}>
              Nombre completo
            </label>
            <input
              id="client-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={INPUT_LG_CLASS}
              required
            />
          </div>

          <div>
            <label htmlFor="client-phone" className={LABEL_CLASS}>
              Teléfono
            </label>
            <input
              id="client-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_LG_CLASS}
              required
            />
          </div>

          <div>
            <label htmlFor="client-address" className={LABEL_CLASS}>
              Dirección
            </label>
            <input
              id="client-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={INPUT_LG_CLASS}
              placeholder="Sin dirección"
            />
          </div>
        </ModalBody>
        <ModalFooter error={formError} onCancel={onClose} submitLabel="Guardar cambios" saving={saving} />
      </form>
    </Modal>
  );
}
