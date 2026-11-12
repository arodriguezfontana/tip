interface StoreDataSectionProps {
  storeName: string;
  setStoreName: (value: string) => void;
  contactPhone: string;
  setContactPhone: (value: string) => void;
  address: string;
  setAddress: (value: string) => void;
}

/** Nombre del local, teléfonos de contacto y dirección. */
export function StoreDataSection({ storeName, setStoreName, contactPhone, setContactPhone, address, setAddress }: StoreDataSectionProps) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
      <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
        Datos del Local y Contacto
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="store-name" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
            Nombre del local *
          </label>
          <input
            id="store-name"
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            required
            maxLength={100}
            placeholder="Ej. Pizzería Nápoles"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label htmlFor="contact-phone" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
            Teléfonos de contacto
          </label>
          <input
            id="contact-phone"
            type="text"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            maxLength={100}
            placeholder="Ej. 11 4444-5555 / 11 2222-3333"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="address" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
            Dirección
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={255}
            placeholder="Ej. Av. Corrientes 1234, CABA"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>
    </section>
  );
}
