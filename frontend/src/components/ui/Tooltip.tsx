import { useState, useId, type ReactNode } from 'react';
import { InfoIcon } from '@/components/Icons';

interface TooltipProps {
  content: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Componente de ayuda contextual accesible para métricas, campos y acciones complejas. */
export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className={`relative inline-flex items-center group ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children ? (
        <span aria-describedby={visible ? id : undefined}>{children}</span>
      ) : (
        <button
          type="button"
          aria-describedby={visible ? id : undefined}
          aria-label="Más información"
          className="text-gray-400 hover:text-gray-600 focus:text-gray-800 focus:outline-none p-0.5 rounded-full transition-colors cursor-help"
        >
          <InfoIcon className="w-3.5 h-3.5" />
        </button>
      )}

      {visible && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-2.5 py-1.5 text-xs text-white bg-gray-900/95 backdrop-blur-xs rounded-lg shadow-xl pointer-events-none whitespace-normal max-w-xs text-center font-normal leading-tight animate-in fade-in zoom-in-95 duration-150"
        >
          {content}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900/95"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}
