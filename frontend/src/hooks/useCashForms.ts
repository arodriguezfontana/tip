import { useState } from 'react';
import type { MovementType } from '@/types/cashShift';
import { OTHER_CATEGORY } from '@/utils/cashShift';

/** Campos del formulario de apertura de caja. */
export function useOpenShiftForm() {
  const [initialAmount, setInitialAmount] = useState('');
  const [notes, setNotes] = useState('');
  const reset = () => {
    setInitialAmount('');
    setNotes('');
  };
  return { initialAmount, setInitialAmount, notes, setNotes, reset };
}

/** Campos del formulario de movimiento manual de efectivo. */
export function useMovementForm() {
  const [type, setType] = useState<MovementType>('egreso');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Pago a proveedor');
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  /** Deja listo el formulario para otro movimiento: conserva el tipo y la categoría elegidos. */
  const reset = () => {
    setAmount('');
    setDescription('');
    if (category === OTHER_CATEGORY) setCustomCategory('');
  };
  return {
    type,
    setType,
    amount,
    setAmount,
    category,
    setCategory,
    customCategory,
    setCustomCategory,
    description,
    setDescription,
    reset,
  };
}

/** Campos del formulario de cierre de caja. */
export function useCloseShiftForm() {
  const [finalAmount, setFinalAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const reset = () => {
    setConfirming(false);
    setFinalAmount('');
    setNotes('');
  };
  return { finalAmount, setFinalAmount, notes, setNotes, confirming, setConfirming, reset };
}

export type OpenShiftForm = ReturnType<typeof useOpenShiftForm>;
export type MovementForm = ReturnType<typeof useMovementForm>;
export type CloseShiftForm = ReturnType<typeof useCloseShiftForm>;
