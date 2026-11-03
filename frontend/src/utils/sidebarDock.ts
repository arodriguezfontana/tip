/** El menú lateral puede quedar abierto mientras se usa la página solo en pantallas anchas (lg de Tailwind). */
export function canKeepMenuOpen(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
}
