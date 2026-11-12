import { CreditCardIcon, LocationPinIcon, PhoneIcon } from '@/components/Icons';
import type { ThemeOption } from '@/types/storeConfig';

interface StorePreviewSectionProps {
  currentTheme: ThemeOption;
  logoUrl: string | null;
  storeName: string;
  address: string;
  contactPhone: string;
  mpAlias: string;
}

/** Vista previa en tiempo real de cómo se ve la web con lo que se está configurando. */
export function StorePreviewSection({ currentTheme, logoUrl, storeName, address, contactPhone, mpAlias }: StorePreviewSectionProps) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
      <h2 className="text-base font-bold text-gray-900">Vista Previa</h2>
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        {/* Cabecera simulada con el color elegido */}
        <div
          className="py-4 px-6 text-white flex items-center justify-between transition-colors duration-300"
          style={{ backgroundColor: currentTheme.hex }}
        >
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img src={logoUrl} alt="Logo preview" className="w-9 h-9 object-contain rounded-lg bg-white/10 p-1" />
            )}
            <span className="text-2xl font-bebas tracking-widest uppercase">
              {storeName.trim() || 'RestoIT'}
            </span>
          </div>
          <div className="text-xs font-medium text-white/80">Web de Pedidos</div>
        </div>

        {/* Banner de datos simulado */}
        <div className="bg-white p-4 border-t border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {address && (
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${currentTheme.hex}18`, color: currentTheme.hex }}
                >
                  <LocationPinIcon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="block text-[10px] font-medium uppercase text-gray-500">Dirección</span>
                  <span className="font-medium text-gray-900 break-words">{address}</span>
                </div>
              </div>
            )}
            {contactPhone && (
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${currentTheme.hex}18`, color: currentTheme.hex }}
                >
                  <PhoneIcon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="block text-[10px] font-medium uppercase text-gray-500">Teléfonos</span>
                  <span className="font-medium text-gray-900 break-words">{contactPhone}</span>
                </div>
              </div>
            )}
            {mpAlias && (
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${currentTheme.hex}18`, color: currentTheme.hex }}
                >
                  <CreditCardIcon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="block text-[10px] font-medium uppercase text-gray-500">Alias MercadoPago</span>
                  <span className="font-medium text-gray-900 break-words">{mpAlias}</span>
                </div>
              </div>
            )}
            {!address && !contactPhone && !mpAlias && (
              <span className="italic text-gray-400 text-xs py-2 sm:col-span-3">Completá los datos de contacto para verlos aquí.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
