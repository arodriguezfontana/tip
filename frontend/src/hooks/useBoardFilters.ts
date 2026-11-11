import { useEffect, useState } from 'react';
import type { SectorFilter } from '@/types/order';
import { FIRST_PAGES } from '@/utils/orderBoard';
import type { ColumnPages, PendingFilter } from '@/utils/orderBoard';

const SEARCH_DEBOUNCE_MS = 250;
const SECTOR_STORAGE_KEY = 'resto_comandas_sector';
const SECTOR_FILTERS = new Set<SectorFilter>(['todos', 'pizzeria', 'cocina', 'barra']);

/** El sector que se estaba viendo la última vez, o todos si no hay uno guardado. */
function readSavedSector(): SectorFilter {
  try {
    const saved = localStorage.getItem(SECTOR_STORAGE_KEY) as SectorFilter | null;
    return saved && SECTOR_FILTERS.has(saved) ? saved : 'todos';
  } catch {
    // Ignorar restricciones de almacenamiento local
    return 'todos';
  }
}

function saveSector(sector: SectorFilter): void {
  try {
    localStorage.setItem(SECTOR_STORAGE_KEY, sector);
  } catch {
    // Ignorar restricciones de almacenamiento local
  }
}

/** Lo que el personal elige para ver el tablero: cuántos pedidos por página, la página de cada columna y los filtros. */
export function useBoardFilters() {
  const [pageSize, setPageSize] = useState<number>(5);
  const [pages, setPages] = useState<ColumnPages>(FIRST_PAGES);
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>('ahora');
  const [selectedSector, setSelectedSector] = useState<SectorFilter>(readSavedSector);

  // Buscador: lo que se escribe se aplica al tablero con una pequeña demora para no filtrar en cada tecla.
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPages(FIRST_PAGES);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const clearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
  };

  const changeSector = (sector: SectorFilter) => {
    setSelectedSector(sector);
    saveSector(sector);
    setPages(FIRST_PAGES);
  };

  const changePendingFilter = (filter: PendingFilter) => {
    setPendingFilter(filter);
    setPages((previous) => ({ ...previous, Pendiente: 1 }));
  };

  const changePage = (status: string, page: number) => {
    setPages((previous) => ({ ...previous, [status]: page }));
  };

  return {
    pageSize,
    setPageSize,
    pages,
    pendingFilter,
    selectedSector,
    searchInput,
    setSearchInput,
    searchTerm,
    clearSearch,
    changeSector,
    changePendingFilter,
    changePage,
  };
}
