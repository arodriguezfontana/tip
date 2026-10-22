import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

export interface SearchableOption {
  value: number;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  /** Si se indica, se ofrece primero una opción que deja el campo sin valor (ej. "Todos los ingredientes"). */
  emptyLabel?: string;
  className?: string;
}

/** Pasa a minúsculas y quita los acentos, para que "limon" encuentre "Limón". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Campo para elegir una opción escribiendo: a medida que se tipea, la lista muestra solo las que
 * coinciden. Se maneja con el mouse o con el teclado (flechas, Enter y Escape).
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  id,
  ariaLabel,
  placeholder,
  emptyLabel,
  className = '',
}: SearchableSelectProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [listStyle, setListStyle] = useState<CSSProperties>({});

  const selected = options.find((option) => option.value === value) ?? null;

  const visibleOptions = useMemo(() => {
    const term = normalize(query.trim());
    const matches = term ? options.filter((option) => normalize(option.label).includes(term)) : options;
    // La opción "vacía" solo tiene sentido cuando no se está buscando nada.
    return emptyLabel && !term ? [{ value: null, label: emptyLabel }, ...matches] : matches;
  }, [options, query, emptyLabel]);

  // La lista se posiciona fija respecto de la ventana para que no la recorte un contenedor con scroll (ej. un modal).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards = spaceBelow < 200 && rect.top > spaceBelow;
      setListStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(openUpwards ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listboxId}-${highlighted}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, highlighted, listboxId]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const choose = (option: { value: number | null }) => {
    onChange(option.value);
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setHighlighted((index) => Math.min(index + 1, visibleOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (!open) return;
      // Evita que Enter envíe el formulario mientras se está eligiendo.
      event.preventDefault();
      const option = visibleOptions[highlighted];
      if (option) choose(option);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && visibleOptions[highlighted] ? `${listboxId}-${highlighted}` : undefined}
        autoComplete="off"
        placeholder={selected ? selected.label : (emptyLabel ?? placeholder)}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => {
          setOpen(true);
          setHighlighted(0);
        }}
        onClick={() => setOpen(true)}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-xl border border-gray-300 bg-white pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
        ▾
      </span>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          style={listStyle}
          className="z-[60] max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {visibleOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">Sin resultados</li>
          ) : (
            visibleOptions.map((option, index) => (
              <li
                key={option.value ?? 'empty'}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                // mousedown en vez de click: así se elige antes de que el campo pierda el foco y cierre la lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  index === highlighted ? 'bg-gray-100' : ''
                } ${option.value === value ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
