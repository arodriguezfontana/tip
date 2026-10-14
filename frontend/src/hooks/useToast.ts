import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_DURATION_MS = 4000;

/** Aviso breve de que una acción salió bien. Se oculta solo a los pocos segundos. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  // Al desmontar no queda un temporizador pendiente que actualice un componente que ya no existe.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { message, show };
}
