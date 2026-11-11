import type { ChangeEvent, RefObject } from 'react';
import backgroundBistro from '@/assets/background_bistro.jpg';
import backgroundKitchen from '@/assets/background_kitchen.jpg';
import backgroundTrattoria from '@/assets/background_trattoria.jpg';
import type { LoginBgOption, ThemeOption } from '@/types/storeConfig';

const LOGIN_BG_CHOICES: {
  id: Exclude<LoginBgOption, 'custom'>;
  name: string;
  image: string;
}[] = [
  { id: 'bistro', name: 'Salón', image: backgroundBistro },
  { id: 'kitchen', name: 'Cocina', image: backgroundKitchen },
  { id: 'trattoria', name: 'Platos', image: backgroundTrattoria },
];

interface LoginBackgroundSectionProps {
  loginBg: LoginBgOption;
  setLoginBg: (option: LoginBgOption) => void;
  loginBgImage: string | null;
  bgFileInputRef: RefObject<HTMLInputElement | null>;
  handleBgFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleRemoveBgImage: () => void;
  currentTheme: ThemeOption;
}

/** Imagen de fondo de la pantalla de ingreso: una de las del sistema o una propia. */
export function LoginBackgroundSection({ loginBg, setLoginBg, loginBgImage, bgFileInputRef, handleBgFileChange, handleRemoveBgImage, currentTheme }: LoginBackgroundSectionProps) {
  return (
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
  );
}
