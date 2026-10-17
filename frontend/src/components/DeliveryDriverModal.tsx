import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { INPUT_LG_CLASS, LABEL_CLASS } from '@/styles/forms';
import type { DeliveryDriver, DeliveryDriverPayload } from '@/types/deliveryDriver';
import { getErrorMessage } from '@/utils/errors';

interface DeliveryDriverModalProps {
  driver?: DeliveryDriver | null;
  onClose: () => void;
  onSave: (data: DeliveryDriverPayload) => Promise<void>;
}

export function DeliveryDriverModal({ driver, onClose, onSave }: DeliveryDriverModalProps) {
  const [name, setName] = useState(driver?.name ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [isActive, setIsActive] = useState(driver?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!name.trim()) {
      setFormError('El nombre del repartidor es obligatorio.');
      return;
    }
    if (!phone.trim()) {
      setFormError('El teléfono del repartidor es obligatorio.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim(),
        is_active: isActive,
      });
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar el repartidor.'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={driver ? `Editar Repartidor: ${driver.name}` : 'Nuevo Repartidor'}
      onClose={onClose}
      closeDisabled={saving}
      width="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0" noValidate>
        <ModalBody>
          <div>
            <label htmlFor="driver-name" className={LABEL_CLASS}>
              Nombre y apellido
            </label>
            <input
              id="driver-name"
              type="text"
              placeholder="Ej. Juan Pérez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_LG_CLASS}
              required
            />
          </div>

          <div>
            <label htmlFor="driver-phone" className={LABEL_CLASS}>
              Teléfono
            </label>
            <input
              id="driver-phone"
              type="text"
              placeholder="Ej. 11 4444-5555"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_LG_CLASS}
              required
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              id="driver-is-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded text-black focus:ring-black border-gray-300 cursor-pointer"
            />
            <label htmlFor="driver-is-active" className="text-sm font-medium text-gray-700 cursor-pointer">
              Personal activo (disponible para asignaciones)
            </label>
          </div>
        </ModalBody>
        <ModalFooter
          error={formError}
          onCancel={onClose}
          submitLabel={driver ? 'Guardar cambios' : 'Registrar repartidor'}
          saving={saving}
        />
      </form>
    </Modal>
  );
}

