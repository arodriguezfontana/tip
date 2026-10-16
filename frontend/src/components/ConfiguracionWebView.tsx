import { useEffect, useRef, useState } from 'react';
import { fetchStoreConfig, updateStoreConfig } from '@/services/storeConfigService';
import { THEME_OPTIONS, type StoreConfig, type ThemeColor } from '@/types/storeConfig';

export function ConfiguracionWebView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [storeName, setStoreName] = useState('RestoIT');
  const [address, setAddress] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<ThemeColor>('black');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetchStoreConfig()
      .then((data: StoreConfig) => {
        if (cancelled) return;
        setStoreName(data.store_name || 'RestoIT');
        setAddress(data.address || '');
        setOpeningHours(data.opening_hours || '');
        setContactPhone(data.contact_phone || '');
        setLogoUrl(data.logo_url || null);
        setThemeColor(data.theme_color || 'black');
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : null;
        setFeedback({ type: 'error', message: msg || 'No se pudo cargar la configuración actual.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Por favor seleccioná un archivo de imagen válido (PNG, JPG, SVG, WebP).' });
      return;
    }

    // Límite de 2MB
    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'La imagen no debe superar los 2 MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
        setFeedback(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      setFeedback({ type: 'error', message: 'El nombre del local es obligatorio.' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const updated = await updateStoreConfig({
        store_name: storeName.trim(),
        address: address.trim() || null,
        opening_hours: openingHours.trim() || null,
        contact_phone: contactPhone.trim() || null,
        logo_url: logoUrl,
        theme_color: themeColor,
      });

      setStoreName(updated.store_name);
      setAddress(updated.address || '');
      setOpeningHours(updated.opening_hours || '');
      setContactPhone(updated.contact_phone || '');
      setLogoUrl(updated.logo_url || null);
      setThemeColor(updated.theme_color || 'black');
      setFeedback({
        type: 'success',
        message: '¡Configuración guardada exitosamente! Los cambios ya se reflejan en la web de pedidos.',
      });
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : null;
      setFeedback({ type: 'error', message: msg || 'Ocurrió un error al guardar los cambios.' });
    } finally {
      setSaving(false);
    }
  };

  const currentTheme = THEME_OPTIONS[themeColor] || THEME_OPTIONS.black;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <p className="text-sm font-medium">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración Web</h1>
          <p className="text-sm text-gray-500 mt-1">
            Personalizá la identidad visual, el logotipo y los datos de contacto que ven tus clientes al hacer pedidos.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between ${
            feedback.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-3 shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identidad y contacto */}
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

            <div>
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

            <div>
              <label htmlFor="opening-hours" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                Horarios de atención
              </label>
              <input
                id="opening-hours"
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                maxLength={255}
                placeholder="Ej. Mar a Dom: 19:30 a 00:00"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
        </section>

        {/* Logo del local */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
            Logo Principal
          </h2>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 relative shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo del local" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="text-center text-gray-400 p-2">
                  <span className="text-xs font-medium">Sin logo</span>
                </div>
              )}
            </div>

            <div className="space-y-2 text-center sm:text-left">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                aria-label="Subir logo"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition"
                >
                  {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 rounded-xl transition"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500">Formatos recomendados: PNG, JPG, SVG o WebP. Máximo 2 MB.</p>
            </div>
          </div>
        </section>

        {/* Estilo y color principal */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Color Principal de la Web</h2>
            <p className="text-xs text-gray-500 mt-1">
              Elegí uno de los 5 estilos preseleccionados para personalizar la barra superior y los acentos de la web pública.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            {(Object.keys(THEME_OPTIONS) as ThemeColor[]).map((key) => {
              const option = THEME_OPTIONS[key];
              const isSelected = themeColor === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setThemeColor(key)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition ${
                    isSelected
                      ? 'border-black bg-gray-50 shadow-sm'
                      : 'border-transparent hover:border-gray-200 bg-white'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={option.name}
                >
                  <span
                    className="w-10 h-10 rounded-full shadow-inner border border-white/20 flex items-center justify-center text-white"
                    style={{ backgroundColor: option.hex }}
                  >
                    {isSelected && (
                      <svg className="w-5 h-5 drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-xs font-bold text-gray-800 text-center">{option.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Vista previa en tiempo real */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
          <h2 className="text-base font-bold text-gray-900">Vista Previa de la Web</h2>
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
            <div className="bg-gray-50 p-4 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-y-2 gap-x-6">
              {address && (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-800">Dirección:</span>
                  <span>{address}</span>
                </div>
              )}
              {openingHours && (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-800">Horarios:</span>
                  <span>{openingHours}</span>
                </div>
              )}
              {contactPhone && (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-800">Tel:</span>
                  <span>{contactPhone}</span>
                </div>
              )}
              {!address && !openingHours && !contactPhone && (
                <span className="italic text-gray-400">Completá los datos de contacto para verlos aquí.</span>
              )}
            </div>
          </div>
        </section>

        {/* Botón de guardar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-black hover:bg-gray-800 text-white font-bold text-sm tracking-wide transition shadow-sm disabled:opacity-50"
          >
            {saving ? 'Guardando cambios...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}

