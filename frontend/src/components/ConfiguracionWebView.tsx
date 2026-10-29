import { useEffect, useRef, useState } from 'react';
import backgroundBistro from '@/assets/background_bistro.jpg';
import backgroundKitchen from '@/assets/background_kitchen.jpg';
import backgroundTrattoria from '@/assets/background_trattoria.jpg';
import { PanelBgPicker } from '@/components/PanelBgPicker';
import { fetchStoreConfig, updateStoreConfig } from '@/services/storeConfigService';
import {
  PRESET_THEME_KEYS,
  THEME_OPTIONS,
  getThemeOption,
  type LoginBgOption,
  type PanelBgOption,
  type StoreConfig,
  type ThemeColor,
} from '@/types/storeConfig';
import { resizeImageToDataUrl } from '@/utils/images';
import { applyThemeColor } from '@/utils/theme';
import { CreditCardIcon, LocationPinIcon, PhoneIcon } from '@/components/Icons';

const LOGIN_BG_CHOICES: {
  id: Exclude<LoginBgOption, 'custom'>;
  name: string;
  image: string;
}[] = [
  {
    id: 'bistro',
    name: 'Salón',
    image: backgroundBistro,
  },
  {
    id: 'kitchen',
    name: 'Cocina',
    image: backgroundKitchen,
  },
  {
    id: 'trattoria',
    name: 'Platos',
    image: backgroundTrattoria,
  },
];

interface ConfiguracionWebViewProps {
  onConfigUpdated?: (config: StoreConfig) => void;
}

export function ConfiguracionWebView({ onConfigUpdated }: ConfiguracionWebViewProps = {}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [storeName, setStoreName] = useState('RestoIT');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<ThemeColor>('black');
  const [loginBg, setLoginBg] = useState<LoginBgOption>('bistro');
  const [loginBgImage, setLoginBgImage] = useState<string | null>(null);
  const [panelBg, setPanelBg] = useState<PanelBgOption>('none');
  const [panelBgImage, setPanelBgImage] = useState<string | null>(null);
  const [panelBgColor, setPanelBgColor] = useState<string | null>(null);
  const [mpAlias, setMpAlias] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetchStoreConfig()
      .then((data: StoreConfig) => {
        if (cancelled) return;
        setStoreName(data.store_name || 'RestoIT');
        setAddress(data.address || '');
        setContactPhone(data.contact_phone || '');
        setLogoUrl(data.logo_url || null);
        setThemeColor(data.theme_color || 'black');
        setLoginBg(data.login_bg || 'bistro');
        setLoginBgImage(data.login_bg_image || null);
        setPanelBg(data.panel_bg || 'none');
        setPanelBgImage(data.panel_bg_image || null);
        setPanelBgColor(data.panel_bg_color || null);
        setMpAlias(data.mp_alias || '');
        applyThemeColor(data.theme_color || 'black');
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

  const handleBgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Por favor seleccioná un archivo de imagen válido (PNG, JPG o WebP).' });
      return;
    }
    // La imagen se achica antes de guardarla, así que se acepta una foto pesada del celular.
    if (file.size > 15 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'La imagen de fondo no debe superar los 15 MB.' });
      return;
    }

    try {
      setLoginBgImage(await resizeImageToDataUrl(file));
      setLoginBg('custom');
      setFeedback(null);
    } catch {
      setFeedback({ type: 'error', message: 'No se pudo leer la imagen seleccionada.' });
    }
  };

  const handleRemoveBgImage = () => {
    setLoginBgImage(null);
    if (loginBg === 'custom') setLoginBg('bistro');
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
        contact_phone: contactPhone.trim() || null,
        logo_url: logoUrl,
        theme_color: themeColor,
        login_bg: loginBg,
        login_bg_image: loginBgImage,
        panel_bg: panelBg,
        panel_bg_image: panelBgImage,
        panel_bg_color: panelBgColor,
        mp_alias: mpAlias.trim() || null,
      });

      setStoreName(updated.store_name);
      setAddress(updated.address || '');
      setContactPhone(updated.contact_phone || '');
      setLogoUrl(updated.logo_url || null);
      setThemeColor(updated.theme_color || 'black');
      setLoginBg(updated.login_bg || 'bistro');
      setLoginBgImage(updated.login_bg_image || null);
      setPanelBg(updated.panel_bg || 'none');
      setPanelBgImage(updated.panel_bg_image || null);
      setPanelBgColor(updated.panel_bg_color || null);
      setMpAlias(updated.mp_alias || '');
      applyThemeColor(updated.theme_color || 'black');
      setFeedback({
        type: 'success',
        message: '¡Configuración guardada exitosamente!',
      });
      onConfigUpdated?.(updated);
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : null;
      setFeedback({ type: 'error', message: msg || 'Ocurrió un error al guardar los cambios.' });
    } finally {
      setSaving(false);
    }
  };

  const currentTheme = getThemeOption(themeColor);
  const isCustomColor = !(PRESET_THEME_KEYS as readonly string[]).includes(themeColor);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <p className="text-sm font-medium">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
          <p className="text-sm text-gray-500 mt-1">
            Personalizá la identidad visual, el logotipo, los colores, el fondo de inicio de sesión, el fondo del panel y los datos de contacto del local.
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
        {/* 1. Datos del local y contacto */}
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

            <div className="md:col-span-2">
              <label htmlFor="mp-alias" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                Alias de MercadoPago
              </label>
              <input
                id="mp-alias"
                type="text"
                value={mpAlias}
                onChange={(e) => setMpAlias(e.target.value)}
                maxLength={100}
                placeholder="Ej. restoit.mp"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Alias de tu cuenta de MercadoPago al cual los clientes abonarán o transferirán en los pedidos del chatbot.
              </p>
            </div>
          </div>
        </section>

        {/* 2. Logo principal */}
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

        {/* 3. Color principal */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Color Principal de la Web</h2>
            <p className="text-xs text-gray-500 mt-1">
              Elegí uno de los estilos preseleccionados o personalizá el color con la paleta para la barra superior y los acentos de la web pública.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            {PRESET_THEME_KEYS.map((key) => {
              const option = THEME_OPTIONS[key];
              const isSelected = themeColor === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setThemeColor(key);
                    applyThemeColor(key);
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition cursor-pointer ${
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

            {/* Botón arcoíris para elegir el color que se desee */}
            <div className="relative">
              <input
                ref={colorInputRef}
                id="custom-color-picker"
                type="color"
                aria-label="Elegir color personalizado"
                value={themeColor.startsWith('#') ? themeColor : '#9333ea'}
                onChange={(e) => {
                  const newColor = e.target.value;
                  setThemeColor(newColor);
                  applyThemeColor(newColor);
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => colorInputRef.current?.click()}
                className={`w-full flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition cursor-pointer ${
                  isCustomColor
                    ? 'border-black bg-gray-50 shadow-sm'
                    : 'border-transparent hover:border-gray-200 bg-white'
                }`}
                aria-pressed={isCustomColor}
                aria-label="Color personalizado"
                title="Elegir el color que desees"
              >
                <span
                  className="w-10 h-10 rounded-full shadow-inner border border-white/40 flex items-center justify-center text-white relative overflow-hidden"
                  style={{
                    background: isCustomColor
                      ? themeColor
                      : 'conic-gradient(from 180deg at 50% 50%, #FF0000 0deg, #FFA500 51deg, #FFFF00 102deg, #008000 153deg, #0000FF 204deg, #4B0082 255deg, #EE82EE 306deg, #FF0000 360deg)',
                  }}
                >
                  {isCustomColor ? (
                    <div className="flex items-center justify-center relative w-full h-full">
                      <svg className="w-5 h-5 drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="absolute -bottom-1 -right-1 text-xs drop-shadow" title="Arcoíris">
                        
                      </span>
                    </div>
                  ) : (
                    <span className="text-base select-none drop-shadow-sm" role="img" aria-label="arcoíris">
                      
                    </span>
                  )}
                </span>
                <span className="text-xs font-bold text-gray-800 text-center">
                  {isCustomColor ? 'Personalizado' : 'Personalizar'}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* 4. Vista previa en tiempo real */}
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

        {/* 5. Fondo para inicio de sesión */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Imagen de Fondo para Inicio de Sesión</h2>
            <p className="text-xs text-gray-500 mt-1">
              Elegí la imagen que se mostrará como fondo en la pantalla de ingreso al sistema, o subí una propia desde tu dispositivo. Por defecto está seleccionada Salón.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            {LOGIN_BG_CHOICES.map((choice) => {
              const isSelected = loginBg === choice.id;
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setLoginBg(choice.id)}
                  aria-pressed={isSelected}
                  aria-label={choice.name}
                  className={`group relative text-left rounded-2xl overflow-hidden border-2 transition-all p-3 flex flex-col ${
                    isSelected
                      ? 'border-black bg-gray-50 shadow-md ring-2 ring-black/10'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-gray-100 mb-2.5">
                    <img
                      src={choice.image}
                      alt={choice.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    {isSelected && (
                      <div
                        className="absolute top-2 right-2 rounded-full p-1 text-white shadow"
                        style={{ backgroundColor: currentTheme.hex }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900">{choice.name}</span>
                    {choice.id === 'bistro' && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Por defecto
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Imagen propia subida desde el dispositivo */}
            <div
              className={`relative text-left rounded-2xl overflow-hidden border-2 transition-all p-3 flex flex-col ${
                loginBg === 'custom'
                  ? 'border-black bg-gray-50 shadow-md ring-2 ring-black/10'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                aria-label="Subir imagen de fondo"
                className="hidden"
                onChange={handleBgFileChange}
              />
              <button
                type="button"
                onClick={() => (loginBgImage ? setLoginBg('custom') : bgFileInputRef.current?.click())}
                aria-pressed={loginBg === 'custom'}
                aria-label="Imagen propia"
                className="group relative aspect-video w-full rounded-xl overflow-hidden bg-gray-100 mb-2.5"
              >
                {loginBgImage ? (
                  <img
                    src={loginBgImage}
                    alt="Imagen propia"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                ) : (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
                    <span className="text-xl leading-none">+</span>
                    <span className="text-xs font-medium">Subir desde el dispositivo</span>
                  </span>
                )}
                {loginBg === 'custom' && (
                  <span
                    className="absolute top-2 right-2 rounded-full p-1 text-white shadow"
                    style={{ backgroundColor: currentTheme.hex }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </button>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-gray-900">Imagen propia</span>
                {loginBgImage && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => bgFileInputRef.current?.click()}
                      className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 underline"
                    >
                      Cambiar
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveBgImage}
                      className="text-[11px] font-semibold text-red-600 hover:text-red-700 underline"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 6. Fondo del panel de administración */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Fondo del Panel de Administración</h2>
            <p className="text-xs text-gray-500 mt-1">
              Si el fondo blanco te cansa la vista, elegí un color liso, una imagen o subí una
              propia. Las imágenes se desenfocan y se oscurecen para que todo se siga leyendo bien. Por defecto el fondo es liso.
            </p>
          </div>
          <PanelBgPicker
            value={panelBg}
            image={panelBgImage}
            color={panelBgColor}
            accentColor={currentTheme.hex}
            onChange={setPanelBg}
            onImageChange={setPanelBgImage}
            onColorChange={setPanelBgColor}
            onError={(message) => setFeedback(message ? { type: 'error', message } : null)}
          />
        </section>

        {/* Botón de guardar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            style={{ backgroundColor: currentTheme.hex }}
            className="px-6 py-3 rounded-xl text-white font-bold text-sm tracking-wide transition shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Guardando cambios...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}

