import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { lookupClientByPhone } from '@/services/clientService';
import type { Client } from '@/types/client';
import { PHONE_PATTERN } from '@/utils/customerValidation';

/** Espera tras la última tecla del teléfono antes de buscar al cliente. */
const LOOKUP_DEBOUNCE_MS = 400;

export type ClientLookup =
  | { status: 'idle' | 'searching' | 'new' | 'error' }
  | { status: 'found'; client: Client };

interface Autofilled {
  name: string;
  address: string;
}

const NOTHING_AUTOFILLED: Autofilled = { name: '', address: '' };

/** El campo se puede pisar si está vacío o si todavía tiene lo que se autocompletó (el usuario no lo editó). */
const isUntouched = (current: string, autofilled: string) => !current.trim() || current === autofilled;

interface FormSetters {
  setName: Dispatch<SetStateAction<string>>;
  setAddress: Dispatch<SetStateAction<string>>;
}

/**
 * Busca al cliente por teléfono y autocompleta su nombre y dirección. Nunca bloquea la carga: si la búsqueda
 * falla o tarda, el usuario sigue completando los campos a mano.
 */
export function useClientLookup(phone: string, { setName, setAddress }: FormSetters) {
  const [lookup, setLookup] = useState<ClientLookup>({ status: 'idle' });
  // Últimos valores autocompletados: solo se pisan campos vacíos o que el usuario no editó.
  const autofilledRef = useRef<Autofilled>(NOTHING_AUTOFILLED);

  useEffect(() => {
    const trimmedPhone = phone.trim();
    if (!PHONE_PATTERN.test(trimmedPhone)) return;

    const controller = new AbortController();

    const autofill = (client: Client) => {
      const previous = autofilledRef.current;
      const clientAddress = client.address ?? '';
      autofilledRef.current = { name: client.full_name, address: clientAddress };
      setName((current) => (isUntouched(current, previous.name) ? client.full_name : current));
      if (clientAddress) {
        setAddress((current) => (isUntouched(current, previous.address) ? clientAddress : current));
      }
    };

    /** Teléfono nuevo: se quitan los datos autocompletados de otro cliente que no se editaron. */
    const clearAutofilled = () => {
      const previous = autofilledRef.current;
      autofilledRef.current = NOTHING_AUTOFILLED;
      if (previous.name) setName((current) => (current === previous.name ? '' : current));
      if (previous.address) setAddress((current) => (current === previous.address ? '' : current));
    };

    const timer = setTimeout(() => {
      setLookup({ status: 'searching' });
      lookupClientByPhone(trimmedPhone, controller.signal)
        .then((client) => {
          if (controller.signal.aborted) return;
          if (client) autofill(client);
          else clearAutofilled();
          setLookup(client ? { status: 'found', client } : { status: 'new' });
        })
        .catch(() => {
          if (!controller.signal.aborted) setLookup({ status: 'error' });
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [phone, setName, setAddress]);

  return {
    lookup,
    /** El teléfono cambió: lo que se había encontrado ya no corresponde. */
    invalidate: () => setLookup({ status: 'idle' }),
    /** Empieza de nuevo (otro pedido): sin búsqueda ni datos autocompletados. */
    reset: () => {
      setLookup({ status: 'idle' });
      autofilledRef.current = NOTHING_AUTOFILLED;
    },
  };
}
