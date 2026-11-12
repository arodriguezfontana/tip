import type { RefObject } from 'react';
import { PRESET_THEME_KEYS, THEME_OPTIONS } from '@/types/storeConfig';
import type { ThemeColor } from '@/types/storeConfig';
import { applyThemeColor } from '@/utils/theme';

interface ThemeColorSectionProps {
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  colorInputRef: RefObject<HTMLInputElement | null>;
}

/** Color principal de la web: uno de los estilos preseleccionados o uno personalizado. */
export function ThemeColorSection({ themeColor, setThemeColor, colorInputRef }: ThemeColorSectionProps) {
  const isCustomColor = !(PRESET_THEME_KEYS as readonly string[]).includes(themeColor);
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Color Principal</h2>
        <p className="text-xs text-gray-500 mt-1">
          Color de la barra y acentos de la web.
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
  );
}
