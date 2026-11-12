import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Comportamiento de una ventana modal: cierre con Escape, foco inicial en el botón indicado, sin scroll del fondo
 * y foco devuelto al elemento anterior al salir.
 */
export function useModalFocus(initialFocus: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    initialFocus.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [initialFocus]);
}
